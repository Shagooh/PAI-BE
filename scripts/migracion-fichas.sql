-- Ficha personal por usuario: META + decisiones de intervención.
-- Ejecutar manualmente en la base de datos de producción (Supabase).

CREATE TABLE IF NOT EXISTS fichas (
  rut VARCHAR(12) PRIMARY KEY REFERENCES usuarios(rut) ON DELETE CASCADE,
  meta TEXT,
  decisiones JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
