create schema if not exists private;

create table posts (
    id  bigint primary key generated always as identity,
    title varchar(255) not null,
    content text not null,
    is_published boolean not null default false,
    created_by uuid not null references auth.users (id),
    created_at timestamp default current_timestamp
);

alter table posts enable row level security;

create policy "Users can CRUD their own posts"
    on posts as permissive for all to authenticated
    using (created_by = auth.uid ())
    with check (created_by = auth.uid ());