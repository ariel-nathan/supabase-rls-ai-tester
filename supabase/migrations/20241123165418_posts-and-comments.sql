create table posts (
    id uuid primary key default gen_random_uuid (),
    title varchar(255) not null,
    content text not null,
    is_published boolean not null default false,
    created_by uuid not null references auth.users (id) default auth.uid (),
    created_at timestamp default current_timestamp
);

create table comments (
    id uuid primary key default gen_random_uuid (),
    post_id uuid not null,
    content text not null,
    created_by uuid not null references auth.users (id) default auth.uid (),
    created_at timestamp default current_timestamp,
    foreign key (post_id) references posts(id)
);

alter table posts enable row level security;

create policy "Users can CRUD their own posts"
    on posts as permissive for all to authenticated
    using (created_by = auth.uid ())
    with check (created_by = auth.uid ());

create policy "Anyone can read published posts"
    on posts as permissive for select to public
    using (is_published);

alter table comments enable row level security;

create policy "Users can read comments on posts they can view"
    on comments as permissive for select to authenticated
    using (exists (select 1 from posts where id = post_id and is_published));

create policy "Users can write comments on posts they can view"
    on comments as permissive for insert to authenticated
    with check (exists (select 1 from posts where id = post_id and is_published));