BEGIN;

DO $$
DECLARE
  id_is_identity text;
  id_seq_name text;
BEGIN
  SELECT c.is_identity
  INTO id_is_identity
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'habilitaciones'
    AND c.column_name = 'id';

  IF id_is_identity = 'YES' THEN
    SELECT pg_get_serial_sequence('public.habilitaciones', 'id')
    INTO id_seq_name;

    IF id_seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, COALESCE((SELECT MAX(id) FROM public.habilitaciones), 0) + 1, false)',
        id_seq_name
      );
    END IF;
  ELSE
    CREATE SEQUENCE IF NOT EXISTS public.habilitaciones_id_seq;

    ALTER TABLE public.habilitaciones
      ALTER COLUMN id SET DEFAULT nextval('public.habilitaciones_id_seq');

    ALTER SEQUENCE public.habilitaciones_id_seq
      OWNED BY public.habilitaciones.id;

    PERFORM setval(
      'public.habilitaciones_id_seq',
      COALESCE((SELECT MAX(id) FROM public.habilitaciones), 0) + 1,
      false
    );
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.habilitaciones
    ADD CONSTRAINT habilitaciones_regla_unique
    UNIQUE (nombre, edad_min, edad_max);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

COMMIT;