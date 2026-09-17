import { describe, expect, it } from 'vitest';
import { toNationCode } from '../lib/nationalities';
import {
  minutesToSeconds,
  splitCommaName,
  splitFullName,
  toHeightCm,
  toIsoDate,
  toNameCase,
  toPosition,
  toTitleCase,
  toWeightKg,
  usualFirstName
} from '../lib/normalize';

describe('toNationCode', () => {
  it('traduce los nombres en español tal y como los escriben las webs', () => {
    expect(toNationCode('España')).toBe('ESP');
    expect(toNationCode('ESTADOS UNIDOS')).toBe('USA');
    expect(toNationCode('EE.UU.')).toBe('USA');
    expect(toNationCode('Bosnia-Herzegovina')).toBe('BIH');
    expect(toNationCode('República Dominicana')).toBe('DOM');
    expect(toNationCode('Macedonia del Norte')).toBe('MKD');
    expect(toNationCode('Costa de Marfil')).toBe('CIV');
    expect(toNationCode('Países Bajos')).toBe('NED');
    expect(toNationCode('Sudán del Sur')).toBe('SSD');
    expect(toNationCode('Irán')).toBe('IRI');
  });

  it('usa el código COI y no el ISO cuando son distintos', () => {
    expect(toNationCode('Alemania')).toBe('GER');
    expect(toNationCode('Eslovenia')).toBe('SLO');
    expect(toNationCode('Croacia')).toBe('CRO');
    expect(toNationCode('Letonia')).toBe('LAT');
    expect(toNationCode('Nigeria')).toBe('NGR');
    expect(toNationCode('Puerto Rico')).toBe('PUR');
    expect(toNationCode('Reino Unido')).toBe('GBR');
  });

  it('no distingue tildes, mayúsculas ni espacios de más', () => {
    expect(toNationCode('  turquia ')).toBe('TUR');
    expect(toNationCode('CAMERÚN')).toBe('CMR');
    expect(toNationCode('eeuu')).toBe('USA');
  });

  it('entiende las abreviaturas de «república» y las erratas conocidas de la FEB', () => {
    expect(toNationCode('R. CHECA')).toBe('CZE');
    expect(toNationCode('REP. DEMOCRÁTICA DEL CONGO')).toBe('COD');
    expect(toNationCode('R. DEL CONGO')).toBe('CGO');
    expect(toNationCode('BOSNIA-HERZERGOVINA')).toBe('BIH');
  });

  it('acepta códigos COI, ISO3 e ISO2', () => {
    expect(toNationCode('GER')).toBe('GER');
    expect(toNationCode('DEU')).toBe('GER');
    expect(toNationCode('de')).toBe('GER');
    expect(toNationCode('SVN')).toBe('SLO');
    expect(toNationCode('US')).toBe('USA');
  });

  it('devuelve null con lo que no reconoce', () => {
    expect(toNationCode('Atlantis')).toBeNull();
    expect(toNationCode('')).toBeNull();
    expect(toNationCode(null)).toBeNull();
  });
});

describe('toPosition', () => {
  it('traduce las posiciones en español, abreviadas y en inglés', () => {
    expect(toPosition('Base')).toBe('PG');
    expect(toPosition('Escolta   ')).toBe('SG');
    expect(toPosition('Alero')).toBe('SF');
    expect(toPosition('Ala-Pívot')).toBe('PF');
    expect(toPosition('Ala Pívot')).toBe('PF');
    expect(toPosition('Pívot')).toBe('C');
    expect(toPosition('AP')).toBe('PF');
    expect(toPosition('B')).toBe('PG');
    expect(toPosition('P')).toBe('C');
    expect(toPosition('Power Forward')).toBe('PF');
    expect(toPosition('Center')).toBe('C');
  });

  it('entiende las formas cortas de ala-pívot de la FEB', () => {
    expect(toPosition('A-Pivot')).toBe('PF');
    expect(toPosition('A-piv')).toBe('PF');
  });

  it('con dos posiciones se queda con la primera', () => {
    expect(toPosition('Base/Escolta')).toBe('PG');
    expect(toPosition('Alero, Ala-pívot')).toBe('SF');
    expect(toPosition('F-C')).toBe('SF');
    expect(toPosition('Escolta y alero')).toBe('SG');
  });

  it('devuelve null si no hay posición o no se reconoce', () => {
    expect(toPosition('')).toBeNull();
    expect(toPosition(null)).toBeNull();
    expect(toPosition('Entrenador')).toBeNull();
  });
});

describe('nombres en mayúsculas', () => {
  it('pone mayúscula inicial respetando partículas, guiones y apóstrofos', () => {
    expect(toNameCase('JUAN JOSE DE LA FUENTE')).toBe('Juan Jose de la Fuente');
    expect(toNameCase('SAINT-SUPERY')).toBe('Saint-Supery');
    expect(toNameCase("O'NEAL")).toBe("O'Neal");
    expect(toNameCase('N´GUESSAN')).toBe('N´Guessan');
    expect(toNameCase('MCDERMOTT')).toBe('McDermott');
    expect(toNameCase('LUTETE IV')).toBe('Lutete IV');
  });

  it('en un trozo de apellidos la partícula inicial va en minúscula', () => {
    expect(toNameCase('DE LARREA', { fragment: true })).toBe('de Larrea');
    expect(toNameCase('DE LARREA')).toBe('De Larrea');
  });

  it('separa «APELLIDOS, NOMBRE» por la coma', () => {
    expect(splitCommaName('DE SOUSA ANJO BRITO, DIOGO EMANUEL')).toEqual({
      firstName: 'Diogo Emanuel',
      lastName: 'de Sousa Anjo Brito'
    });
    expect(splitCommaName('GALAN POZO , ALEJANDRO')).toEqual({
      firstName: 'Alejandro',
      lastName: 'Galan Pozo'
    });
    expect(splitCommaName('SIN COMA')).toBeNull();
  });

  it('sin coma, un español lleva dos apellidos y un extranjero uno', () => {
    expect(splitFullName('ROLAND DENZEL ANDERSSON', { spanish: false })).toEqual({
      firstName: 'Roland Denzel',
      lastName: 'Andersson'
    });
    expect(splitFullName('JOSE MANUEL GARCIA PEREZ', { spanish: true })).toEqual({
      firstName: 'Jose Manuel',
      lastName: 'Garcia Perez'
    });
    expect(splitFullName('FELIPE DOS ANJOS DE PAULA', { spanish: true })).toEqual({
      firstName: 'Felipe',
      lastName: 'dos Anjos de Paula'
    });
    expect(splitFullName('DEVON DOEKELE VAN OOSTRUM', { spanish: false })).toEqual({
      firstName: 'Devon Doekele',
      lastName: 'van Oostrum'
    });
  });

  it('con sólo dos palabras, aunque sea español, una es nombre y otra apellido', () => {
    expect(splitFullName('SERGE IBAKA', { spanish: true })).toEqual({
      firstName: 'Serge',
      lastName: 'Ibaka'
    });
    expect(splitFullName('NENE', { spanish: false })).toEqual({ firstName: '', lastName: 'Nene' });
  });

  it('del nombre legal deja el de uso: el primero, salvo los compuestos habituales', () => {
    expect(usualFirstName('Philip Alexander')).toBe('Philip');
    expect(usualFirstName('Karl Olle Viktor')).toBe('Karl');
    expect(usualFirstName('Serigne M M Sy Dit Diamil')).toBe('Serigne');
    expect(usualFirstName('Jose Maria')).toBe('Jose Maria');
    expect(usualFirstName('José Manuel')).toBe('José Manuel');
    expect(usualFirstName('Juan Pablo')).toBe('Juan Pablo');
    expect(usualFirstName('Miguel Ángel')).toBe('Miguel Ángel');
    expect(usualFirstName('Jean Marc')).toBe('Jean Marc');
    expect(usualFirstName('Alejandro')).toBe('Alejandro');
    expect(usualFirstName('')).toBe('');
  });

  it('en nombres de clubes y pabellones respeta siglas y paréntesis', () => {
    expect(toTitleCase('GRUPO CAESA SEGUROS FC CARTAGENA CB')).toBe(
      'Grupo Caesa Seguros FC Cartagena CB'
    );
    expect(toTitleCase('PABELLÓN MUNICIPAL DE DEPORTES (PALENCIA)')).toBe(
      'Pabellón Municipal de Deportes (Palencia)'
    );
    expect(toTitleCase('CLOUD.GAL OURENSE BALONCESTO')).toBe('Cloud.gal Ourense Baloncesto');
  });
});

describe('minutos, fechas y medidas', () => {
  it('convierte los minutos a segundos en cualquier formato', () => {
    expect(minutesToSeconds('548:54')).toBe(548 * 60 + 54);
    expect(minutesToSeconds('4:05')).toBe(245);
    expect(minutesToSeconds('1:02:03')).toBe(3723);
    expect(minutesToSeconds('17,5')).toBe(1050);
    expect(minutesToSeconds('17.5')).toBe(1050);
    expect(minutesToSeconds(12)).toBe(720);
    expect(minutesToSeconds('-')).toBe(0);
    expect(minutesToSeconds('')).toBe(0);
  });

  it('lee fechas dd/mm/aaaa y dd-mm-aaaa aunque lleven la ciudad detrás', () => {
    expect(toIsoDate('21/09/1996 NJURUNDA')).toBe('1996-09-21');
    expect(toIsoDate('15-10-1997')).toBe('1997-10-15');
    expect(toIsoDate('3/3/2006')).toBe('2006-03-03');
    expect(toIsoDate('31/13/2000')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });

  it('da la altura en centímetros venga en metros o en centímetros', () => {
    expect(toHeightCm('203')).toBe(203);
    expect(toHeightCm('188 cm')).toBe(188);
    expect(toHeightCm('1,75')).toBe(175);
    expect(toHeightCm(199)).toBe(199);
    expect(toHeightCm('-')).toBeNull();
    expect(toHeightCm('0')).toBeNull();
  });

  it('descarta pesos vacíos o imposibles', () => {
    expect(toWeightKg('95')).toBe(95);
    expect(toWeightKg('- Kg')).toBeNull();
    expect(toWeightKg('0')).toBeNull();
  });
});
