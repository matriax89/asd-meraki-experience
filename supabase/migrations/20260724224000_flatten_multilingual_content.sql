-- A legacy migration wrapped already-localized JSONB values in an additional
-- {"it": ...} layer. Preserve every translation by unwrapping only values
-- whose Italian entry is itself an object.

update public.courses set
  nome = case when jsonb_typeof(nome -> 'it') = 'object' then nome -> 'it' else nome end,
  descrizione_breve = case when jsonb_typeof(descrizione_breve -> 'it') = 'object' then descrizione_breve -> 'it' else descrizione_breve end,
  descrizione_lunga = case when jsonb_typeof(descrizione_lunga -> 'it') = 'object' then descrizione_lunga -> 'it' else descrizione_lunga end,
  meta_title = case when jsonb_typeof(meta_title -> 'it') = 'object' then meta_title -> 'it' else meta_title end,
  meta_description = case when jsonb_typeof(meta_description -> 'it') = 'object' then meta_description -> 'it' else meta_description end,
  benefici = case when jsonb_typeof(benefici -> 'it') = 'object' then benefici -> 'it' else benefici end,
  attrezzatura_richiesta = case when jsonb_typeof(attrezzatura_richiesta -> 'it') = 'object' then attrezzatura_richiesta -> 'it' else attrezzatura_richiesta end;

update public.products set
  nome = case when jsonb_typeof(nome -> 'it') = 'object' then nome -> 'it' else nome end,
  descrizione_breve = case when jsonb_typeof(descrizione_breve -> 'it') = 'object' then descrizione_breve -> 'it' else descrizione_breve end,
  descrizione_lunga = case when jsonb_typeof(descrizione_lunga -> 'it') = 'object' then descrizione_lunga -> 'it' else descrizione_lunga end,
  meta_title = case when jsonb_typeof(meta_title -> 'it') = 'object' then meta_title -> 'it' else meta_title end,
  meta_description = case when jsonb_typeof(meta_description -> 'it') = 'object' then meta_description -> 'it' else meta_description end;

update public.events set
  titolo = case when jsonb_typeof(titolo -> 'it') = 'object' then titolo -> 'it' else titolo end,
  sottotitolo = case when jsonb_typeof(sottotitolo -> 'it') = 'object' then sottotitolo -> 'it' else sottotitolo end,
  descrizione = case when jsonb_typeof(descrizione -> 'it') = 'object' then descrizione -> 'it' else descrizione end,
  meta_title = case when jsonb_typeof(meta_title -> 'it') = 'object' then meta_title -> 'it' else meta_title end,
  meta_description = case when jsonb_typeof(meta_description -> 'it') = 'object' then meta_description -> 'it' else meta_description end;

update public.pricing_plans set
  titolo = case when jsonb_typeof(titolo -> 'it') = 'object' then titolo -> 'it' else titolo end,
  descrizione = case when jsonb_typeof(descrizione -> 'it') = 'object' then descrizione -> 'it' else descrizione end,
  cta_label = case when jsonb_typeof(cta_label -> 'it') = 'object' then cta_label -> 'it' else cta_label end;
