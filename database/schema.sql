-- J’eace PostgreSQL target schema (PostgreSQL 15+).
-- Apply tenant context with SET LOCAL app.tenant_id = '<trusted UUID>' on every
-- database transaction. The runnable demo currently uses an in-memory store instead.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    plan text NOT NULL DEFAULT 'ACADEMIC' CHECK (plan IN ('ACADEMIC', 'FREE', 'STANDARD', 'CUSTOM')),
    retention_mode text NOT NULL DEFAULT 'LIMITED_RETENTION' CHECK (retention_mode IN ('FULL_RETENTION', 'LIMITED_RETENTION', 'HASH_ONLY')),
    retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 0 AND 3650),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id)
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MODERATOR', 'READ_ONLY')),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'INVITED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, email)
);

CREATE TABLE applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    description text,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED')),
    monthly_quota bigint NOT NULL DEFAULT 1000 CHECK (monthly_quota >= 0),
    retention_mode text CHECK (retention_mode IN ('FULL_RETENTION', 'LIMITED_RETENTION', 'HASH_ONLY')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    application_id uuid NOT NULL,
    key_hash bytea NOT NULL UNIQUE,
    key_prefix text NOT NULL CHECK (length(key_prefix) BETWEEN 4 AND 24),
    label text NOT NULL DEFAULT 'Primary key',
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    last_used_at timestamptz,
    revoked_at timestamptz,
    created_by uuid,
    UNIQUE (tenant_id, id),
    CONSTRAINT api_keys_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id),
    CONSTRAINT api_keys_creator_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES users (tenant_id, id)
);
COMMENT ON COLUMN api_keys.key_hash IS 'Cryptographic hash only; never persist or audit the raw API key.';

CREATE TABLE policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    application_id uuid NOT NULL,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    description text,
    strategy text NOT NULL DEFAULT 'THRESHOLD' CHECK (strategy IN ('THRESHOLD', 'MAX', 'WEIGHTED_AVERAGE', 'ALL_MUST_AGREE')),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, application_id, name),
    CONSTRAINT policies_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id),
    CONSTRAINT policies_creator_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES users (tenant_id, id)
);

CREATE TABLE policy_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    flag_threshold numeric(5,4) NOT NULL CHECK (flag_threshold BETWEEN 0 AND 1),
    block_threshold numeric(5,4) NOT NULL CHECK (block_threshold BETWEEN 0 AND 1),
    strategy_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT policy_threshold_order CHECK (flag_threshold < block_threshold),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, policy_id, version),
    CONSTRAINT policy_versions_policy_fk FOREIGN KEY (tenant_id, policy_id)
        REFERENCES policies (tenant_id, id),
    CONSTRAINT policy_versions_creator_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES users (tenant_id, id)
);

ALTER TABLE applications ADD COLUMN active_policy_version_id uuid;
ALTER TABLE applications ADD CONSTRAINT applications_active_policy_fk
    FOREIGN KEY (tenant_id, active_policy_version_id)
    REFERENCES policy_versions (tenant_id, id);

CREATE TABLE submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    application_id uuid NOT NULL,
    source text,
    content_type text NOT NULL DEFAULT 'text/plain',
    locale text,
    content_sha256 bytea NOT NULL CHECK (octet_length(content_sha256) = 32),
    content_ciphertext bytea,
    content_expires_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    CONSTRAINT submissions_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id),
    CONSTRAINT submissions_retention_consistency CHECK (
        content_ciphertext IS NULL OR content_expires_at IS NOT NULL
    )
);
COMMENT ON COLUMN submissions.content_sha256 IS 'A content fingerprint is not guaranteed to be anonymous; access remains tenant-scoped.';
COMMENT ON COLUMN submissions.content_ciphertext IS 'Optional encrypted payload only when retention mode and legal basis permit retention.';

CREATE TABLE detection_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    submission_id uuid NOT NULL,
    score numeric(7,6) NOT NULL CHECK (score BETWEEN 0 AND 1),
    confidence numeric(7,6) CHECK (confidence BETWEEN 0 AND 1),
    classification text NOT NULL CHECK (classification IN ('AI_LIKELY', 'HUMAN_LIKELY', 'UNCERTAIN')),
    detector_name text NOT NULL,
    model_version text NOT NULL,
    latency_ms integer NOT NULL CHECK (latency_ms >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, submission_id, detector_name, model_version),
    CONSTRAINT detection_submission_fk FOREIGN KEY (tenant_id, submission_id)
        REFERENCES submissions (tenant_id, id)
);

CREATE TABLE decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    submission_id uuid NOT NULL,
    detection_result_id uuid NOT NULL,
    policy_version_id uuid NOT NULL,
    policy_version integer NOT NULL CHECK (policy_version > 0),
    score_snapshot numeric(7,6) NOT NULL CHECK (score_snapshot BETWEEN 0 AND 1),
    flag_threshold_snapshot numeric(5,4) NOT NULL CHECK (flag_threshold_snapshot BETWEEN 0 AND 1),
    block_threshold_snapshot numeric(5,4) NOT NULL CHECK (block_threshold_snapshot BETWEEN 0 AND 1),
    decision text NOT NULL CHECK (decision IN ('ALLOW', 'FLAG', 'BLOCK')),
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    CONSTRAINT decisions_threshold_order CHECK (flag_threshold_snapshot < block_threshold_snapshot),
    CONSTRAINT decisions_submission_fk FOREIGN KEY (tenant_id, submission_id)
        REFERENCES submissions (tenant_id, id),
    CONSTRAINT decisions_detection_fk FOREIGN KEY (tenant_id, detection_result_id)
        REFERENCES detection_results (tenant_id, id),
    CONSTRAINT decisions_policy_version_fk FOREIGN KEY (tenant_id, policy_version_id)
        REFERENCES policy_versions (tenant_id, id)
);

CREATE TABLE review_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    application_id uuid NOT NULL,
    submission_id uuid NOT NULL,
    decision_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'COMPLETED', 'CANCELLED')),
    priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    assigned_to uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, decision_id),
    CONSTRAINT review_app_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id),
    CONSTRAINT review_submission_fk FOREIGN KEY (tenant_id, submission_id)
        REFERENCES submissions (tenant_id, id),
    CONSTRAINT review_decision_fk FOREIGN KEY (tenant_id, decision_id)
        REFERENCES decisions (tenant_id, id),
    CONSTRAINT review_assignee_fk FOREIGN KEY (tenant_id, assigned_to)
        REFERENCES users (tenant_id, id)
);

CREATE TABLE reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    review_queue_id uuid NOT NULL,
    moderator_id uuid NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('UPHELD', 'OVERTURNED')),
    final_decision text NOT NULL CHECK (final_decision IN ('ALLOW', 'FLAG', 'BLOCK')),
    notes text NOT NULL CHECK (length(notes) BETWEEN 1 AND 10000),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    CONSTRAINT reviews_queue_fk FOREIGN KEY (tenant_id, review_queue_id)
        REFERENCES review_queue (tenant_id, id),
    CONSTRAINT reviews_moderator_fk FOREIGN KEY (tenant_id, moderator_id)
        REFERENCES users (tenant_id, id)
);

CREATE TABLE webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    application_id uuid NOT NULL,
    endpoint_url text NOT NULL,
    event_types text[] NOT NULL DEFAULT ARRAY['analysis.completed'],
    secret_ciphertext bytea NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    CONSTRAINT webhooks_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id)
);
COMMENT ON COLUMN webhooks.secret_ciphertext IS 'Encrypt at rest; only reveal raw webhook secrets once at creation; never include in audit payloads.';

CREATE TABLE webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    webhook_id uuid NOT NULL,
    event_id uuid NOT NULL DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'DELIVERING', 'DELIVERED', 'RETRYING', 'FAILED')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at timestamptz,
    response_code integer,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, webhook_id, event_id),
    CONSTRAINT deliveries_webhook_fk FOREIGN KEY (tenant_id, webhook_id)
        REFERENCES webhooks (tenant_id, id)
);

CREATE TABLE batch_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    application_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED')),
    item_count integer NOT NULL CHECK (item_count > 0),
    completed_count integer NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (tenant_id, id),
    CONSTRAINT batch_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id)
);

CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    actor_user_id uuid,
    application_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    CONSTRAINT audit_actor_fk FOREIGN KEY (tenant_id, actor_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT audit_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id)
);
COMMENT ON TABLE audit_log IS 'Append-only audit events. Never include raw API keys, webhook secrets, passwords, or submitted text.';

CREATE TABLE usage_counters (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    application_id uuid NOT NULL,
    counter_date date NOT NULL,
    analyses_total bigint NOT NULL DEFAULT 0 CHECK (analyses_total >= 0),
    analyses_succeeded bigint NOT NULL DEFAULT 0 CHECK (analyses_succeeded >= 0),
    analyses_failed bigint NOT NULL DEFAULT 0 CHECK (analyses_failed >= 0),
    characters_analyzed bigint NOT NULL DEFAULT 0 CHECK (characters_analyzed >= 0),
    api_requests bigint NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
    review_actions bigint NOT NULL DEFAULT 0 CHECK (review_actions >= 0),
    PRIMARY KEY (tenant_id, application_id, counter_date),
    CONSTRAINT usage_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES applications (tenant_id, id)
);

CREATE INDEX submissions_tenant_created_idx ON submissions (tenant_id, created_at DESC);
CREATE INDEX submissions_tenant_app_created_idx ON submissions (tenant_id, application_id, created_at DESC);
CREATE INDEX submissions_hash_idx ON submissions (tenant_id, content_sha256);
CREATE INDEX detection_tenant_created_idx ON detection_results (tenant_id, created_at DESC);
CREATE INDEX decisions_tenant_decision_created_idx ON decisions (tenant_id, decision, created_at DESC);
CREATE INDEX review_tenant_status_created_idx ON review_queue (tenant_id, status, created_at ASC);
CREATE INDEX audit_tenant_occurred_idx ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX webhook_deliveries_status_idx ON webhook_deliveries (tenant_id, status, next_attempt_at);

-- Tenant isolation is enforced in PostgreSQL and not left to frontend filtering.
-- Set app.tenant_id from verified server-side identity, never from an untrusted body/header.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenants', 'users', 'applications', 'api_keys', 'policies', 'policy_versions',
    'submissions', 'detection_results', 'decisions', 'review_queue', 'reviews',
    'webhooks', 'webhook_deliveries', 'batch_jobs', 'audit_log', 'usage_counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

CREATE FUNCTION reject_immutable_row_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a new version/event instead', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_mutation();
CREATE TRIGGER policy_versions_no_update BEFORE UPDATE OR DELETE ON policy_versions
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_mutation();
CREATE TRIGGER detection_results_no_update BEFORE UPDATE OR DELETE ON detection_results
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_mutation();
CREATE TRIGGER decisions_no_update BEFORE UPDATE OR DELETE ON decisions
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_mutation();
CREATE TRIGGER reviews_no_update BEFORE UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_mutation();
