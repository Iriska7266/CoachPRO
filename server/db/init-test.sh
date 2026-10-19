#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=test_password="$TEST_DB_PASSWORD" --set=dev_database="$POSTGRES_DB" <<'SQL'
CREATE USER coachpro_test PASSWORD :'test_password';
CREATE DATABASE coachpro_test OWNER coachpro_test;
REVOKE CONNECT ON DATABASE :"dev_database" FROM PUBLIC;
REVOKE CONNECT ON DATABASE coachpro_test FROM PUBLIC;
GRANT CONNECT ON DATABASE coachpro_test TO coachpro_test;
SQL
