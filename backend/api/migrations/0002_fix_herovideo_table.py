from django.db import migrations

SQL_CREATE = """
CREATE TABLE IF NOT EXISTS api_herovideo (
    id bigserial PRIMARY KEY,
    title varchar(200) NOT NULL DEFAULT '',
    file varchar(100) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL
);
"""

class Migration(migrations.Migration):
    dependencies = [
        ("api", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(SQL_CREATE),
    ]
