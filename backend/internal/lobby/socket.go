package lobby

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/profile"
)

// Handler must be wrapped in Tickets.UpgradeGuard. No UID or name is accepted from messages.
func Handler(manager *Manager, store profile.Store, origin string) http.Handler {
	upgrade := websocket.Upgrader{HandshakeTimeout: 5 * time.Second, CheckOrigin: func(r *http.Request) bool { return origin != "" && r.Header.Get("Origin") == origin }}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := identity.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", 401)
			return
		}
		name := "ゲスト"
		if !p.Guest {
			name = strings.TrimSpace(p.Name)
			if !profile.ValidName(name) {
				name = "プレイヤー"
			}
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			var err error
			name, err = store.GetOrCreate(ctx, p.UID, name)
			cancel()
			if err != nil {
				http.Error(w, "profile unavailable", 503)
				return
			}
		}
		c, err := upgrade.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		c.SetReadLimit(1024)
		_ = c.SetReadDeadline(time.Now().Add(10 * time.Second))

		kind, data, readErr := c.ReadMessage()
		var join struct {
			Type       string `json:"type"`
			InstanceID string `json:"instanceId"`
			RoomID     string `json:"roomId"`
		}
		d := json.NewDecoder(bytes.NewReader(data))
		d.DisallowUnknownFields()
		if readErr != nil || kind != websocket.TextMessage || d.Decode(&join) != nil || d.Decode(new(any)) != io.EOF || join.Type != "join" || (join.InstanceID == "") != (join.RoomID == "") {
			closeSocket(c, 1008, "join_required")
			return
		}
		s, err := manager.JoinResume(p.UID, name, p.Guest, join.InstanceID, join.RoomID)
		if err != nil {
			closeSocket(c, 1008, err.Error())
			return
		}
		defer manager.Leave(s, false)
		c.SetPongHandler(func(token string) error {
			received := time.Now()
			if s.latency.pong(token, received) {
				return c.SetReadDeadline(received.Add(45 * time.Second))
			}
			return nil
		})
		_ = c.SetReadDeadline(time.Now().Add(45 * time.Second))
		done := make(chan struct{})
		go func() {
			defer close(done)
			defer c.Close()
			ticker := time.NewTicker(probeInterval)
			defer ticker.Stop()
			for {
				select {
				case snapshot, ok := <-s.Updates:
					if !ok {
						manager.mu.Lock()
						reason := "room_closed"
						if manager.closed {
							reason = "server_restarted"
						}
						manager.mu.Unlock()
						closeSocket(c, 1000, reason)
						return
					}
					_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
					if c.WriteJSON(snapshot) != nil {
						return
					}
				case <-ticker.C:
					token := s.latency.ping(time.Now())
					if token == "" {
						continue
					}
					if c.WriteControl(websocket.PingMessage, []byte(token), time.Now().Add(5*time.Second)) != nil {
						return
					}
				case <-r.Context().Done():
					return
				}
			}
		}()
		for {
			kind, data, err := c.ReadMessage()
			if err != nil || kind != websocket.TextMessage {
				break
			}
			command := manager.receiveCommand(s, data)
			if command == "tap" {
				continue
			}
			if command == "leave" {
				manager.Leave(s, true)
				break
			}
			if command == "" {
				break
			}
			closeSocket(c, 1008, "invalid_message")
			break
		}
		manager.Leave(s, false)
		_ = c.Close()
		<-done
	})
}

// Capture the authoritative receipt time before JSON decoding, under the same
// lock used by timers so completion cannot race ahead of a received command.
func (m *Manager) receiveCommand(s *Subscription, data []byte) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	received := time.Now()
	command := decodeCommand(data)
	if command == "tap" {
		m.tap(s, received)
	}
	return command
}
func decodeCommand(data []byte) string {
	var msg struct {
		Type string `json:"type"`
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if d.Decode(&msg) != nil || d.Decode(new(any)) != io.EOF {
		return "invalid"
	}
	return msg.Type
}
func closeSocket(c *websocket.Conn, code int, reason string) {
	_ = c.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, reason), time.Now().Add(time.Second))
}
