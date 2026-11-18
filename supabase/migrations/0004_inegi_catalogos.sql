-- DealMX · 0004 · catálogos INEGI (claves geoestadísticas)
-- NOTA: estados completos (32). Municipios: NL (19) y Coahuila (05) completos, capturados de memoria
-- porque inegi.org no era accesible al generar esto. Verificar y completar el resto del país con
-- scripts/import-inegi.ts contra el catálogo oficial (CVE_ENT/CVE_MUN).

insert into inegi_estados (clave, nombre) values
('01','Aguascalientes'),('02','Baja California'),('03','Baja California Sur'),('04','Campeche'),
('05','Coahuila de Zaragoza'),('06','Colima'),('07','Chiapas'),('08','Chihuahua'),('09','Ciudad de México'),
('10','Durango'),('11','Guanajuato'),('12','Guerrero'),('13','Hidalgo'),('14','Jalisco'),('15','México'),
('16','Michoacán de Ocampo'),('17','Morelos'),('18','Nayarit'),('19','Nuevo León'),('20','Oaxaca'),
('21','Puebla'),('22','Querétaro'),('23','Quintana Roo'),('24','San Luis Potosí'),('25','Sinaloa'),
('26','Sonora'),('27','Tabasco'),('28','Tamaulipas'),('29','Tlaxcala'),('30','Veracruz de Ignacio de la Llave'),
('31','Yucatán'),('32','Zacatecas');

insert into inegi_municipios (estado_clave, clave, nombre) values
('19','001','Abasolo'),('19','002','Agualeguas'),('19','003','Los Aldamas'),('19','004','Allende'),
('19','005','Anáhuac'),('19','006','Apodaca'),('19','007','Aramberri'),('19','008','Bustamante'),
('19','009','Cadereyta Jiménez'),('19','010','El Carmen'),('19','011','Cerralvo'),('19','012','China'),
('19','013','Ciénega de Flores'),('19','014','Doctor Arroyo'),('19','015','Doctor Coss'),
('19','016','Doctor González'),('19','017','Galeana'),('19','018','García'),
('19','019','San Pedro Garza García'),('19','020','General Bravo'),('19','021','General Escobedo'),
('19','022','General Terán'),('19','023','General Treviño'),('19','024','General Zaragoza'),
('19','025','General Zuazua'),('19','026','Guadalupe'),('19','027','Los Herreras'),('19','028','Higueras'),
('19','029','Hualahuises'),('19','030','Iturbide'),('19','031','Juárez'),('19','032','Lampazos de Naranjo'),
('19','033','Linares'),('19','034','Marín'),('19','035','Melchor Ocampo'),('19','036','Mier y Noriega'),
('19','037','Mina'),('19','038','Montemorelos'),('19','039','Monterrey'),('19','040','Parás'),
('19','041','Pesquería'),('19','042','Los Ramones'),('19','043','Rayones'),('19','044','Sabinas Hidalgo'),
('19','045','Salinas Victoria'),('19','046','San Nicolás de los Garza'),('19','047','Hidalgo'),
('19','048','Santa Catarina'),('19','049','Santiago'),('19','050','Vallecillo'),('19','051','Villaldama'),
('05','001','Abasolo'),('05','002','Acuña'),('05','003','Allende'),('05','004','Arteaga'),('05','005','Candela'),
('05','006','Castaños'),('05','007','Cuatro Ciénegas'),('05','008','Escobedo'),('05','009','Francisco I. Madero'),
('05','010','Frontera'),('05','011','General Cepeda'),('05','012','Guerrero'),('05','013','Hidalgo'),
('05','014','Jiménez'),('05','015','Juárez'),('05','016','Lamadrid'),('05','017','Matamoros'),
('05','018','Monclova'),('05','019','Morelos'),('05','020','Múzquiz'),('05','021','Nadadores'),('05','022','Nava'),
('05','023','Ocampo'),('05','024','Parras'),('05','025','Piedras Negras'),('05','026','Progreso'),
('05','027','Ramos Arizpe'),('05','028','Sabinas'),('05','029','Sacramento'),('05','030','Saltillo'),
('05','031','San Buenaventura'),('05','032','San Juan de Sabinas'),('05','033','San Pedro'),
('05','034','Sierra Mojada'),('05','035','Torreón'),('05','036','Viesca'),('05','037','Villa Unión'),
('05','038','Zaragoza');
