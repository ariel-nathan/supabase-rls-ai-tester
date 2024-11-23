create schema if not exists private;

create or replace function private.create_seed_user (email text, password text) returns uuid as $$
    declare
        user_id uuid;
        encrypted_pw text;
begin
        user_id := gen_random_uuid();
        encrypted_pw := crypt(password, gen_salt('bf'));

        insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        values
                ('00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated', email, encrypted_pw, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

        insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values
                (gen_random_uuid(), user_id, format('{"sub":"%s","email":"%s"}', user_id::text, email)::jsonb, 'email', now(), now(), now());

        return user_id;
end;
$$ language plpgsql;

do $$
begin
        private.create_seed_user('ariel@xaac.com', 'password123');
        private.create_seed_user('adaniel@xaac.com', 'password123');
        private.create_seed_user('kelechi@xaac.com', 'password123');
        private.create_seed_user('renang@xaac.com', 'password123');
end $$;