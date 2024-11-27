Each section in this guide reflects an error that the author of this repo made in the RLS policies defined in the `./supabase/migrations` folder.
The section will include a description of the problem, an example of an incorrect RLS policy (`bad example`), and an example of how to correctly write the RLS policy (`good example`).
Use this knowledge when writing your own RLS policy tests.

# Properly Structuring RLS Policies to Prevent Common Issues

When writing RLS policies, the order and structure of your conditions matter. Here are some common issues and how to fix them:

bad example:

```sql
create policy "Users can CRUD their own posts"
    on posts for all to authenticated
    using (created_by = auth.uid())
    with check (created_by = auth.uid());

create policy "Anyone can read published posts"
    on posts for select to authenticated, anon
    using (is_published);

create policy "Users can write comments on posts they can view"
    on comments for insert to authenticated
    with check (
        exists (
            select 1
            from posts
            where id = post_id
            and (is_published or created_by = auth.uid())
        )
    );
```

good example:

```sql
create policy "Users can CRUD their own posts"
    on posts
    as permissive
    for all
    to authenticated
    using (created_by = auth.uid())
    with check (created_by = auth.uid());

create policy "Anyone can read published posts"
    on posts
    for select
    to authenticated, anon
    using (is_published = true);

create policy "Users can write comments on posts they can view"
    on comments
    for insert
    to authenticated
    with check (
        created_by = auth.uid() -- This must be first to prevent impersonation
        and exists (
            select 1
            from posts
            where id = post_id
            and (is_published = true or created_by = auth.uid())
        )
    );
```

The good example fixes several issues:

1. **Explicit Boolean Conditions**: Using `is_published = true` instead of just `is_published` makes the intention clear
2. **Prevent User Impersonation**:

# Properly Handling Cascading Deletes in RLS Policies

When designing tables with foreign key relationships, it's important to consider how RLS policies and cascading deletes interact. Here's an example of a problematic setup:

bad example:

```sql
create table posts (
    id bigint primary key,
    content text,
    created_by uuid references auth.users(id)
);

create table comments (
    id bigint primary key,
    post_id bigint references posts(id), -- Missing ON DELETE CASCADE
    content text,
    created_by uuid references auth.users(id)
);

create policy "Users can delete their own posts"
    on posts for delete to authenticated
    using (created_by = auth.uid());

create policy "Users can delete their own comments"
    on comments for delete to authenticated
    using (created_by = auth.uid());
```

good example:

```sql
create table posts (
    id bigint primary key,
    content text,
    created_by uuid references auth.users(id)
);

create table comments (
    id bigint primary key,
    post_id bigint references posts(id) on delete cascade,
    content text,
    created_by uuid references auth.users(id)
);

create policy "Users can delete their own posts"
    on posts for delete to authenticated
    using (created_by = auth.uid());

-- No need for a comment deletion policy since they're handled by CASCADE
```

The good example fixes several issues:

1. **Automatic Cleanup**: Using `ON DELETE CASCADE` ensures that when a post is deleted, all its associated comments are automatically removed
2. **Simpler Policies**: No need to write separate deletion policies for comments since the database handles cleanup
3. **Prevents Orphaned Records**: Without CASCADE, you could end up with comments referencing non-existent posts if the deletion policies aren't properly coordinated

# Proper Boolean Error Handling in RLS Policies and Tests

When working with boolean columns and RLS policies, it's important to handle both the NOT NULL constraint and invalid boolean values correctly.

bad example:

```sql
-- Table definition missing NOT NULL constraint
create table posts (
    id bigint primary key,
    title text,
    is_published boolean default false,  -- Missing NOT NULL
    created_by uuid references auth.users(id)
);

-- Tests not handling boolean constraints properly
select tests.authenticate_as('post_owner');
insert into posts (title, content, is_published) values
('Test Post', 'Content', NULL);  -- Will fail

select throws_ok(
    $$select * from posts where is_published = 'invalid'::boolean$$,
    '22P02',
    'invalid input syntax for type boolean: invalid',  -- Wrong error message
    'Cannot query with invalid boolean value'
);
```

good example:

```sql
-- Table definition with proper constraints
create table posts (
    id bigint primary key,
    title text,
    is_published boolean not null default false,  -- Added NOT NULL
    created_by uuid references auth.users(id)
);

-- Tests handling boolean constraints
```
