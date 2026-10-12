-- ONLY for disposable vanilla PostgreSQL. Not a migration or live Supabase test.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id) on delete restrict,name text not null,unique(bucket_id,name));
create function storage.foldername(p_name text) returns text[] language sql immutable as $$select (string_to_array(p_name,'/'))[1:array_length(string_to_array(p_name,'/'),1)-1];$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated;
grant all on storage.objects,storage.buckets to service_role;
