import pg from 'pg';

// The supplied TIMESTAMP WITHOUT TIME ZONE schema cannot retain an offset.
// Interpret existing wall-clock values as UTC and send new Date values in UTC.
pg.defaults.parseInputDatesAsUTC = true;
pg.types.setTypeParser(1114, (value: string) => new Date(`${value.replace(' ', 'T')}Z`));
