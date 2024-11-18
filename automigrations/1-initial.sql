drop schema if exists app cascade;        
drop schema if exists app_secret cascade; 

-- Public schema
create schema app;
-- Private schema (though we don't use it in this demo)
create schema app_secret;

-- Grant usage of our public schema to app_postgraphile user
grant usage on schema app to app_postgraphile;

-- This simple game just needs to track the bets that are being made
create table app.wheel_bet (
  -- caas_hidden schema gives us a way to generate uuidv7 until postgres supports it natively
  id           uuid  primary key default caas_hidden.uuid_generate_v7(),
  wager        float not null,
  multiplier   float not null,

  net          float not null, -- negative if lost, wager*(multiplier-1) if won
  currency_key text  not null,

  -- lets us easily look up the lastest bets for users, casinos, experiences
  user_id       uuid not null references caas.user(id),
  casino_id     uuid not null references caas.casino(id), 
  experience_id uuid not null references caas.experience(id), 

  foreign key (currency_key, casino_id) references caas.currency(key, casino_id)
)

