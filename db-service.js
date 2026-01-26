/**
 * DB 서비스 모듈
 * Db 클래스의 모든 메서드를 구현합니다.
 */

// MySQL 타입 코드를 문자열로 변환하는 맵
// mysql2/lib/constants/Types.js 기반
const typeNames = {
  0x00: "DECIMAL",
  0x01: "TINY",
  0x02: "SHORT",
  0x03: "LONG",
  0x04: "FLOAT",
  0x05: "DOUBLE",
  0x06: "NULL",
  0x07: "TIMESTAMP",
  0x08: "LONGLONG",
  0x09: "INT24",
  0x0a: "DATE",
  0x0b: "TIME",
  0x0c: "DATETIME",
  0x0d: "YEAR",
  0x0e: "NEWDATE",
  0x0f: "VARCHAR",
  0x10: "BIT",
  0xf2: "VECTOR",
  0xf5: "JSON",
  0xf6: "NEWDECIMAL",
  0xf7: "ENUM",
  0xf8: "SET",
  0xf9: "TINY_BLOB",
  0xfa: "MEDIUM_BLOB",
  0xfb: "LONG_BLOB",
  0xfc: "BLOB",
  0xfd: "VAR_STRING",
  0xfe: "STRING",
  0xff: "GEOMETRY",
};


/**
 * SELECT 문에 LIMIT 추가 (이미 LIMIT이 있으면 유지)
 * @param {string} sql - SQL 쿼리
 * @param {number} maxRows - 최대 행 수 (없거나 0 이하면 LIMIT 추가 안 함)
 * @returns {string} LIMIT이 추가된 SQL
 */
function addLimitToSelect(sql, maxRows) {
  const trimmedSql = sql.trim();

  // CALL 문은 LIMIT을 지원하지 않음
  if (trimmedSql.toUpperCase().startsWith("CALL")) {
    return trimmedSql;
  }

  // SELECT 문이 아니면 LIMIT 추가하지 않음
  if (!trimmedSql.toUpperCase().startsWith("SELECT")) {
    return trimmedSql;
  }

  // maxRows가 없거나 유효하지 않으면 LIMIT 추가하지 않음
  if (!maxRows || maxRows <= 0 || !Number.isInteger(maxRows)) {
    return trimmedSql;
  }

  // 세미콜론 제거
  let querySql = trimmedSql.replace(/;\s*$/, "");

  // LIMIT이 이미 있는지 확인 (대소문자 구분 없이)
  const limitRegex = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i;
  if (limitRegex.test(querySql)) {
    // 기존 LIMIT 유지
    return querySql;
  }

  // LIMIT 추가
  return querySql + ` LIMIT ${maxRows}`;
}

/**
 * fields 배열을 직렬화 가능한 형태로 변환
 * @param {Array} fields - mysql2 fields 배열
 * @returns {Array} 직렬화 가능한 메타데이터 배열
 */
function convertFieldsToMeta(fields) {
  const arr = [];

  for (let i = 0; i < fields.length; i++) {
    // 타입 코드를 문자열로 변환
    const typeCode = fields[i]?.columnType || fields[i]?.type;
    const typeName = typeNames[typeCode] || (typeCode ? String(typeCode) : "");

    arr.push({
      name: fields[i]?.name || "",
      type: typeName,
      nullable: fields[i]?.null === 1 ? "YES" : "NO",
    });
  }
  return arr;
}

/**
 * SQL 쿼리 실행 (SELECT)
 * @param {Object} connection - DB 연결
 * @param {string} sql - SQL 쿼리
 * @param {number} maxRows - 최대 행 수
 * @returns {Promise<Array>} [rows, fields] 배열
 */
async function executeSelect(connection, sql, maxRows, paramsArray) {
  console.log(`[DB Service] executeSelect 호출 - sql: ${sql}, maxRows: ${maxRows}`);
  try {
    await connection.query("SET @rownum := 0");

    const querySql = addLimitToSelect(sql, maxRows);

    console.log(`[DB Service] executeSelect 실행할 SQL: ${querySql}`);
    const [rows, fields] = await connection.execute(querySql, paramsArray);
    console.log(
      `[DB Service] executeSelect 실행 완료 - ${rows.length}개 행 반환, ${fields.length}개 필드`
    );

    // fields를 직렬화 가능한 형태로 변환
    const meta = convertFieldsToMeta(fields);
    // SELECT는 읽기 전용이므로 commit/rollback 불필요 (트랜잭션에 영향 없음)
    return [rows, meta];
  } catch (error) {
    console.error(`[DB Service] executeSelect 오류 - ${error.message}`);
    console.error(`[DB Service] executeSelect 오류 스택:`, error.stack);
    console.error(`[DB Service] executeSelect 오류 발생 시 SQL:`, sql);
    throw error;
  }
}

/**
 * 프로시저 호출 (prepared statement)
 * @param {Object} connection - DB 연결
 * @param {string} command - 프로시저 호출 명령
 * @returns {Promise<Array>} 결과 배열
 */
async function callPreparedStatement(connection, command) {
  const [rows] = await connection.query(command);
  await connection.commit();
  return rows;
}

/**
 * INSERT/UPDATE/DELETE 쿼리 실행
 * @param {Object} connection - DB 연결
 * @param {string} sql - SQL 쿼리
 * @param {Array} paramsArray - 파라미터 배열
 * @returns {Promise<Object>} ResultSetHeader 객체
 */
async function executeQuery(connection, sql, paramsArray) {
  console.log(`[DB Service] executeQuery 호출 - sql: ${sql}`);
  try {
    const safeParams = Array.isArray(paramsArray) ? paramsArray : [];
    const [result] = await connection.query(sql, safeParams);
    await connection.commit();
    console.log(`[DB Service] executeQuery 실행 완료`, {
      affectedRows: result?.affectedRows || 0,
      insertId: result?.insertId || null,
    });
    return result;
  } catch (error) {
    console.error(`[DB Service] executeQuery 오류 - ${error.message}`);
    console.error(`[DB Service] executeQuery 오류 스택:`, error.stack);
    console.error(`[DB Service] executeQuery 오류 발생 시 SQL:`, sql);
    throw error;
  }
}


/**
 * 프로시저 쿼리 실행 (params 배열을 그대로 바인딩, 첫 번째 SELECT rows/fields + ResultSetHeader 반환)
 * @param {Object} connection - DB 연결
 * @param {string} sql - SQL 쿼리 (CALL 문)
 * @param {Array} paramsArray - 바인딩할 파라미터 배열
 * @returns {Promise<{rows: Array, fields: Array, resultSet: Object|null}>}
 */
async function queryByProcedureWithParamsArray(connection, sql, paramsArray) {
  console.log(
    `[DB Service] queryByProcedureWithParamsArray 호출 - sql: ${sql}`
  );

  const safeParams = Array.isArray(paramsArray) ? paramsArray : [];
  const [rows, fields] = await connection.query(sql, safeParams);
 
  // 기본값 초기화
  let firstSelectRows = [];
  let firstSelectFieldsRaw = [];
  let resultSet = null;

  // rows/fields가 다중 결과셋 형태인 경우 (SELECT + ResultSetHeader 등)
  if (Array.isArray(rows)) {
    if (Array.isArray(rows[0])) {
      // 첫 번째 SELECT 결과셋
      firstSelectRows = rows[0];
    }

    // fields도 [ [FieldPacket...], ... ] 구조일 수 있음
    if (
      Array.isArray(fields) &&
      fields.length > 0 &&
      Array.isArray(fields[0])
    ) {
      firstSelectFieldsRaw = fields[0];
    }

    // rows 안에서 ResultSetHeader 찾기
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i];
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        ("affectedRows" in v || "insertId" in v || "serverStatus" in v)
      ) {
        resultSet = v;
        break;
      }
    }
  } else if (
    // 프로시저 안에 SELECT 없이 UPDATE/INSERT만 있을 때:
    // rows 자체가 ResultSetHeader 객체로 내려옴
    rows &&
    typeof rows === "object" &&
    !Array.isArray(rows) &&
    ("affectedRows" in rows || "insertId" in rows || "serverStatus" in rows)
  ) {
    resultSet = rows;
    // firstSelectRows / firstSelectFieldsRaw 는 빈 배열 유지
  }

  await connection.commit();
  return {
    rows: firstSelectRows,
    fields: convertFieldsToMeta(firstSelectFieldsRaw),
    resultSet,
  };
}

module.exports = {
  executeSelect,
  callPreparedStatement,
  queryByProcedureWithParamsArray,
  executeQuery,
};
