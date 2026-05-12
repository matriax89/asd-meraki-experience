create or replace function increment_ticket_count(row_id uuid)
returns void as $$
begin
  update events
  set posti_venduti = posti_venduti + 1
  where id = row_id;
end;
$$ language plpgsql;
