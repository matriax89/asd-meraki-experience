-- A guest may buy a ticket without supplying a tax code or identity document.
-- The application normalizes an omitted document to two empty strings; keep
-- every other contact field, the existing document checks and private storage.
create or replace function public.commerce_attendee_valid(p_attendee jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb:=p_attendee; key text; countries text:=' AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW ';
begin
  if a is null or jsonb_typeof(a) is distinct from 'object' or (select count(*) from jsonb_object_keys(a))<>8 then return false; end if;
  foreach key in array array['firstName','lastName','email','phone','documentType','documentCountry','documentNumber'] loop
    if jsonb_typeof(a->key) is distinct from 'string' then return false; end if;
  end loop;
  if jsonb_typeof(a->'marketingConsent') is distinct from 'boolean' then return false; end if;
  if length(btrim(a->>'firstName')) not between 1 and 100 or length(btrim(a->>'lastName')) not between 1 and 100
    or (a->>'firstName') ~ '[[:cntrl:]]' or (a->>'lastName') ~ '[[:cntrl:]]'
    or length(a->>'email')>254 or a->>'email'<>lower(btrim(a->>'email'))
    or a->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or a->>'phone' !~ '^\+[1-9][0-9]{6,14}$'
    or a->>'documentType' not in ('codice_fiscale','foreign_id') then return false; end if;
  if a->>'documentNumber'='' then return a->>'documentCountry'=''; end if;
  if length(a->>'documentCountry')<>2 or strpos(countries,' '||(a->>'documentCountry')||' ')=0 then return false; end if;
  if a->>'documentType'='codice_fiscale' then
    return a->>'documentCountry'='IT' and public.attendee_tax_code_valid(a->>'documentNumber') and a->>'documentNumber'=upper(replace(a->>'documentNumber',' ',''));
  elsif a->>'documentType'='foreign_id' then
    return a->>'documentCountry'<>'IT' and a->>'documentNumber' ~ '^[A-Z0-9][A-Z0-9 -]{1,30}[A-Z0-9]$';
  end if;
  return false;
end;
$$;

revoke all on function public.commerce_attendee_valid(jsonb) from public,anon,authenticated;
grant execute on function public.commerce_attendee_valid(jsonb) to service_role;
