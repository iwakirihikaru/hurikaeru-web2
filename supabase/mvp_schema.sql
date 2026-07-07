create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  school_year integer not null,
  grade text not null default '',
  class_name text not null default '',
  teacher_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'teacher', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  attendance_number integer not null,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (class_id, attendance_number)
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject text not null default '',
  name text not null,
  periods_count integer not null default 1,
  fields_json jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  period_number integer not null,
  status text not null check (status in ('draft', 'active', 'closed')),
  started_at timestamptz,
  ended_at timestamptz,
  fields_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  draft_json jsonb not null default '{}'::jsonb,
  submitted_json jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  feedback_text text not null default '',
  feedback_handwriting_url text not null default '',
  feedback_returned_at timestamptz,
  ai_comment text not null default '',
  ai_status text not null default 'idle' check (ai_status in ('idle', 'pending', 'done', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table if not exists response_history (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  snapshot_json jsonb not null default '{}'::jsonb,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_classes_organization_id on classes(organization_id);
create index if not exists idx_students_class_id on students(class_id);
create index if not exists idx_units_class_id on units(class_id);
create index if not exists idx_lessons_class_id on lessons(class_id);
create index if not exists idx_lessons_unit_id on lessons(unit_id);
create index if not exists idx_responses_lesson_id on responses(lesson_id);
create index if not exists idx_responses_student_id on responses(student_id);
create index if not exists idx_response_history_response_id on response_history(response_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_responses_updated_at on responses;
create trigger trg_responses_updated_at
before update on responses
for each row execute function set_updated_at();
