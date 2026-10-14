package lobby

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"firebase.google.com/go/v4/auth"
	"github.com/gorilla/websocket"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
)

type verifier struct{}

func (verifier) VerifyIDTokenAndCheckRevoked(_ context.Context, uid string) (*auth.Token, error) {
	if uid == "invalid" {
		return nil, fmt.Errorf("invalid")
	}
	token := &auth.Token{UID: uid}
	token.Firebase.SignInProvider = "anonymous"
	return token, nil
}
func socketServer(t *testing.T, wait time.Duration) (*httptest.Server, *Manager) {
	t.Helper()
	m := testManager(t, wait)
	tickets := identity.NewTickets()
	mux := http.NewServeMux()
	mux.Handle("POST /api/ws-ticket", identity.Middleware(verifier{}, http.HandlerFunc(tickets.Issue)))
	mux.Handle("/api/lobby", tickets.UpgradeGuard("http://localhost:5173", Handler(m, nil, "http://localhost:5173")))
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server, m
}
func ticketURL(t *testing.T, server *httptest.Server, uid string) string {
	t.Helper()
	req, _ := http.NewRequest("POST", server.URL+"/api/ws-ticket", nil)
	req.Header.Set("Authorization", "Bearer "+uid)
	resp, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer resp.Body.Close()
	var body struct {
		Ticket string `json:"ticket"`
	}
	if e = json.NewDecoder(resp.Body).Decode(&body); e != nil {
		t.Fatal(e)
	}
	return "ws" + strings.TrimPrefix(server.URL, "http") + "/api/lobby?ticket=" + body.Ticket
}
func dial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	c, _, e := websocket.DefaultDialer.Dial(url, http.Header{"Origin": []string{"http://localhost:5173"}})
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { c.Close() })
	return c
}
func readRoom(t *testing.T, c *websocket.Conn) Snapshot {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	var r Snapshot
	if e := c.ReadJSON(&r); e != nil {
		t.Fatal(e)
	}
	return r
}
func TestSocketMultipleClientsAndSecurity(t *testing.T) {
	server, _ := socketServer(t, 150*time.Millisecond)
	url := ticketURL(t, server, "a")
	_, response, e := websocket.DefaultDialer.Dial(url, http.Header{"Origin": []string{"http://evil.test"}})
	if e == nil || response.StatusCode != 403 {
		t.Fatal("origin accepted")
	}
	a := dial(t, url)
	a.WriteJSON(map[string]string{"type": "join"})
	first := readRoom(t, a)
	_, response, e = websocket.DefaultDialer.Dial(url, http.Header{"Origin": []string{"http://localhost:5173"}})
	if e == nil || response.StatusCode != 401 {
		t.Fatal("ticket replay accepted")
	}
	b := dial(t, ticketURL(t, server, "b"))
	b.WriteJSON(map[string]string{"type": "join"})
	second := readRoom(t, b)
	if second.RoomID != first.RoomID || len(second.Participants) != 2 {
		t.Fatal("clients not joined")
	}
	for first.Phase != "locked" {
		first = readRoom(t, a)
	}
	if len(first.Participants) != 100 {
		t.Fatal("bots not filled")
	}
	c := dial(t, ticketURL(t, server, "c"))
	c.WriteJSON(map[string]string{"type": "join"})
	third := readRoom(t, c)
	if third.RoomID == first.RoomID || len(third.Participants) != 1 {
		t.Fatal("room isolation failed")
	}
	c.WriteJSON(map[string]string{"type": "leave"})
}
func TestSocketRejectsIdentitySpoofAndDuplicate(t *testing.T) {
	server, _ := socketServer(t, time.Hour)
	a := dial(t, ticketURL(t, server, "a"))
	a.WriteJSON(map[string]string{"type": "join"})
	readRoom(t, a)
	duplicate := dial(t, ticketURL(t, server, "a"))
	duplicate.WriteJSON(map[string]string{"type": "join"})
	duplicate.SetReadDeadline(time.Now().Add(time.Second))
	_, _, e := duplicate.ReadMessage()
	if ce, ok := e.(*websocket.CloseError); !ok || ce.Text != "already_connected" {
		t.Fatalf("duplicate: %v", e)
	}
	spoof := dial(t, ticketURL(t, server, "b"))
	spoof.WriteJSON(map[string]string{"type": "join", "userId": "a"})
	spoof.SetReadDeadline(time.Now().Add(time.Second))
	_, _, e = spoof.ReadMessage()
	if !websocket.IsCloseError(e, 1008) {
		t.Fatalf("spoof: %v", e)
	}
}

func TestSocketDisconnectRemovesWaitingParticipant(t *testing.T) {
	server, _ := socketServer(t, time.Hour)
	a := dial(t, ticketURL(t, server, "a"))
	a.WriteJSON(map[string]string{"type": "join"})
	readRoom(t, a)
	b := dial(t, ticketURL(t, server, "b"))
	b.WriteJSON(map[string]string{"type": "join"})
	readRoom(t, b)
	a.Close()
	r := readRoom(t, b)
	if len(r.Participants) != 1 {
		t.Fatal("disconnected participant retained")
	}
	b.WriteJSON(map[string]string{"type": "leave"})
	b.SetReadDeadline(time.Now().Add(time.Second))
	_, _, err := b.ReadMessage()
	if err == nil {
		t.Fatal("leave did not close socket")
	}
}
