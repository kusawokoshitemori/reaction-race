BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating integer NOT NULL DEFAULT 1500 CHECK (rating >= 0);
CREATE TABLE IF NOT EXISTS matches (
 id uuid PRIMARY KEY,
 room_id uuid NOT NULL,
 finished_at timestamptz NOT NULL,
 saved_at timestamptz NOT NULL DEFAULT now(),
 formula_version text NOT NULL,
 payload_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS match_results (
 match_id uuid NOT NULL REFERENCES matches(id),
 participant_id text NOT NULL,
 user_uid text REFERENCES users(firebase_uid),
 display_name text NOT NULL,
 bot boolean NOT NULL,
 guest boolean NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('success', 'flying', 'no-record')),
 rank integer CHECK (rank BETWEEN 1 AND 100),
 reaction_ms bigint CHECK (reaction_ms >= 0 AND reaction_ms < 3000),
 measurement text NOT NULL,
 rating_before integer CHECK (rating_before >= 0),
 rating_after integer CHECK (rating_after >= 0),
 PRIMARY KEY (match_id, participant_id),
 UNIQUE (match_id, user_uid),
 CHECK (NOT (bot AND guest)),
 CHECK ((outcome = 'success' AND reaction_ms IS NOT NULL) OR (outcome <> 'success' AND reaction_ms IS NULL AND rank IS NULL)),
 CHECK (rank IS NULL OR (outcome = 'success' AND measurement IN ('corrected', 'bot'))),
 CHECK ((bot OR guest) = (user_uid IS NULL)),
 CHECK ((bot OR guest) AND rating_before IS NULL AND rating_after IS NULL OR NOT bot AND NOT guest AND rating_before IS NOT NULL AND rating_after IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS match_results_user ON match_results(user_uid, match_id) WHERE user_uid IS NOT NULL;
COMMIT;
