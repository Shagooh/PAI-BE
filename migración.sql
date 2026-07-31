--
-- PostgreSQL database dump
--

-- Dumped from database version 16.2
-- Dumped by pg_dump version 16.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: habilitaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.habilitaciones (
    id integer NOT NULL,
    nombre character varying(50) NOT NULL,
    edad_min integer NOT NULL,
    edad_max integer NOT NULL,
    resultado character varying(100) NOT NULL,
    descripcion text
);


ALTER TABLE public.habilitaciones OWNER TO postgres;

--
-- Name: habilitaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.habilitaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.habilitaciones_id_seq OWNER TO postgres;

--
-- Name: habilitaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.habilitaciones_id_seq OWNED BY public.habilitaciones.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    rut character varying(12) NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    edad integer NOT NULL,
    descripcion character varying(50) GENERATED ALWAYS AS (
CASE
    WHEN (edad >= 18) THEN 'Mayor de edad'::text
    ELSE 'Menor de edad'::text
END) STORED,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- Name: habilitaciones id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habilitaciones ALTER COLUMN id SET DEFAULT nextval('public.habilitaciones_id_seq'::regclass);


--
-- Data for Name: habilitaciones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.habilitaciones (id, nombre, edad_min, edad_max, resultado, descripcion) FROM stdin;
1	Menor de edad	0	17	No esta habilitado	Personas que no han alcanzado la mayoria de edad
2	Mayor de edad	18	999	Esta habilitado	Personas que han alcanzado la mayoria de edad
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (rut, nombre, apellido, edad, created_at) FROM stdin;
18.768.749-7	Santiago	Rodriguez	23	2026-07-31 00:56:24.911289
\.


--
-- Name: habilitaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.habilitaciones_id_seq', 2, true);


--
-- Name: habilitaciones habilitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habilitaciones
    ADD CONSTRAINT habilitaciones_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (rut);


--
-- PostgreSQL database dump complete
--

