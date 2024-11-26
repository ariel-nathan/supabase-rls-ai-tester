A Guide to testing on Supabase using pgTAP - Basejump
===============

[![Image 1: Basejump Logo](https://usebasejump.com/_next/image?url=%2Fimages%2Fbasejump-logo.png&w=96&q=75) Basejump ========](https://usebasejump.com/)

[![Image 2: Basejump Logo](https://usebasejump.com/_next/image?url=%2Fimages%2Fbasejump-logo.png&w=96&q=75) Basejump ========](https://usebasejump.com/)

- [Documentation](https://usebasejump.com/docs)
- [Articles](https://usebasejump.com/blog)
- [GitHub](https://github.com/usebasejump/basejump)

[Home](https://usebasejump.com/)/[Articles](https://usebasejump.com/blog)/A Guide to testing on Supabase using pgTAP

Supabase

# A Guide to testing on Supabase using pgTAP

Testing Supabase applications can be a bit intimidating at first glance. You get pgTAP out of the box, but there isn't a ton of guidance on how to property test your app - particularly RLS policies and authentication. Here's a quick rundown of what I've learned building out the tests for Basejump.

If you're a code first kinda person, you can check out the [Basejump tests on Github instead](https://github.com/usebasejump/supabase-test-helpers/tree/main/tests) instead.

## [What we'll cover](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#what-we-ll-cover)

- [Setup and run tests](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#installing)
- [Supabase test helpers](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#test-helpers)
- [Writing tests for Supabase](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#writing-tests-for-supabase)
- [Testing authenticated requests](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#testing-authenticated)
- [Testing anonymous requests](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#testing-anonymous)
- [Ensuring RLS is enabled on all tables](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#checking-rls)
- [Testing your RLS Policies](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#rls-testing)
- [Testing Insert Policies](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#rls-insert)
- [Testing Update Policies](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#rls-update)
- [Testing Delete Policies](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#rls-delete)
- [Testing Select Policies](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#rls-select)
- [Running your tests as a Github action](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#github-action)

## [](https://usebasejump.com/blog/testing-on-supabase-with-pgtap#setup-and-run-tests)Setup and run tests

Supabase has always included pgTAP by default as an extension, you'll just want to enable it in your project. Great news is they now support the pg_prove test runner by default as well! Just make sure you have the [latest CLI installed](https://supabase.com/docs/guides/cli).

Once installed, tests should be located in your `supabase/tests` folder with a `.sql` extension. You can run tests using the following command:

```bash
supabase test db


CopyCopied!

Supabase test helpers

While not required, we’ve created some Supabase test helpers to make testing your Supabase database a bit easier. You can find them on Github. The helpers provide you useful functionality like authenticating as a user, creating test users and verifying RLS policies.

Some example methods in the helper library are:

create_supabase_user(identifier, email, phone) - Creates a test user in your Supabase project
get_supabase_user(identifier) - Returns information on the test user
authenticate_as(identifier) - Authenticates you as the user and sets all the required JWT values
clear_authentication() - logs out of any session and puts you in an anon state
Writing tests for Supabase

To write your first tests, you’ll want to add a new file to your supabase/tests/database folder with a .sql extension. I recommend naming them using the convention XX-feature-being-tested.sql. For example, 01-account-creation.sql.

Once you’ve created your test file, you can begin writing test. All tests should take the following format:

-- begin the transaction, this will allow you to rollback any changes made during the test
BEGIN;

-- plan your test in advance, this ensures the proper number of tests have been run.
select plan(1);

-- run your test

select ok(true, 'test passed');

-- check the results of your test
select * from finish();

-- rollback the transaction, completing the test scenario
ROLLBACK;


CopyCopied!

Testing authenticated requests

By default, all tests are run as the postgres user, meaning you have full access to the database. That can be useful for some things, but doesn’t provide very comprehensive test scenarios. You can change that by authenticating as a specific user:

The following examples leverage the Supabase test helpers.

BEGIN;

select plan(2);

-- create users for testing
select tests.create_supabase_user('test_owner');
select tests.create_supabase_user('test_reader');

-- create an example post for testing
insert into posts (title, body, user_id) values ('test post', 'this is a test post', tests.get_supabase_uid('test_owner'));

-- authenticate as reader
select tests.authenticate_as('test_reader');

-- verify that we cannot update the post
SELECT
    is_empty(
            $$ update posts set content = 'Post updated by viewer' returning content $$,
            'Post viewers cannot update posts'
        );

-- verify that the reader can view the post
select results_eq(
               $$ select title from posts $$,
               $$ VALUES('test post') $$,
               'Readers can view posts'
           );

-- finish out the test scenario
select * from finish();

ROLLBACK;


CopyCopied!

Testing anonymous requests

Similarly, you can test anonymous requests by clearing the authentication:

BEGIN;

select plan(2);

-- create users for testing
select tests.create_supabase_user('test_owner');

-- create an example post for testing
insert into posts (title, body, user_id) values ('test post', 'this is a test post', tests.get_supabase_uid('test_owner'));

-- clear out authentication
select tests.clear_authentication();

-- verify that we cannot update the post
SELECT
    is_empty(
            $$ update posts set content = 'Post updated by viewer' returning content $$,
            'Post viewers cannot update posts'
        );

-- verify that the reader can view the post
select is_empty(
               $$ select title from posts $$,
               'Anon users cannot view posts'
           );

-- finish out the test scenario
select * from finish();

ROLLBACK;


CopyCopied!

Checking for missing RLS on tables

It’s a good practice to make sure all tables have RLS policies defined. The test helpers have a convenience method to make that easy


BEGIN;

select plan(1);

select tests.rls_enabled('public');

select * from finish();

ROLLBACK;


CopyCopied!

Testing your RLS Policies

It can be a bit challenging to know how to test RLS policies specifically. Here are a few examples I’ve found helpful:

Insert policies

Inserting policies that are protected by RLS will throw an error when blocked. You can test them as follows:

BEGIN;

select plan(1);

-- ensure you're anon
select tests.clear_authentication();

SELECT
    throws_ok(
            $$ insert into posts (content) values ('Post created by anon') $$,
            'new row violates row-level security policy for table "posts"'
        );

select * from finish();

ROLLBACK;


CopyCopied!

Update policies

Blocked update requests will NOT throw an error. I’ve found it’s useful to return a fake value and check for it instead

BEGIN;

select plan(1);

-- create users for testing
select tests.create_supabase_user('test_owner');

-- create an example post for testing
insert into posts (title, body, user_id) values ('test post', 'this is a test post', tests.get_supabase_uid('test_owner'));


-- ensure you're anon
select tests.clear_authentication();

SELECT
    is_empty(
            $$ update posts set content = 'Post updated by anon' returning content $$,
            'anon users cannot update posts'
        );

select * from finish();

ROLLBACK;


CopyCopied!

Delete policies

Similar to updates, delete requests that are blocked will not throw an error. The same format will work, however:

BEGIN;

select plan(1);

-- create users for testing
select tests.create_supabase_user('test_owner');

-- create an example post for testing
insert into posts (title, body, user_id) values ('test post', 'this is a test post', tests.get_supabase_uid('test_owner'));


-- ensure you're anon
select tests.clear_authentication();

SELECT
    is_empty(
            $$ delete from posts returning 1 $$,
            'Anon cannot delete posts'
        );

select * from finish();

ROLLBACK;


CopyCopied!

Select policies

Select policies are a bit tricky. They’ll filter out any rows that are not a match for your policy. When testing these, you’ll want to make sure you have a clean dataset to work with:

BEGIN;

select plan(1);

-- create users for testing
select tests.create_supabase_user('test_owner');

-- create an example post for testing
insert into posts (title, body, user_id) values ('test post', 'this is a test post', tests.get_supabase_uid('test_owner'));


-- ensure you're anon
select tests.clear_authentication();

SELECT
    is_empty(
            $$ select * from posts $$,
            'Anon cannot select posts'
        );

select * from finish();

ROLLBACK;


CopyCopied!

Running your tests automatically using Github Actions

Once your tests are ready to go, you can configure them to run on every PR using Github Actions. Note that right now the Supabase github action defaults to v1 of the CLI, so you need to specify version 1.11.4 or greater. Here’s an example workflow file:

.github/workflows/pgTAP.yml

name: PGTap Tests
on:
  pull_request:
    branches: [ main ]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: supabase/setup-cli@v1
        with:
          version: 1.11.4
      - name: Supabase Start
        run: supabase start
      - name: Run Tests
        run: supabase test db


CopyCopied!

© Copyright 2024. All rights reserved.

Follow us on TwitterFollow us on GitHub
```
