/**
 * DB 연결 관리 모듈
 * 동적으로 DB 연결을 생성하고 관리합니다.
 */

const mysql = require("mysql2/promise");
const os = require("os");

// DB 연결 풀 저장소 (key: dburl, value: connection pool)
const connectionPools = {};

/**
 *
 * DB 연결 풀 생성 또는 가져오기
 * @param {string} dburl - 데이터베이스 URL
 * @param {string} dbuser - 데이터베이스 사용자명
 * @param {string} dbpassword - 데이터베이스 비밀번호
 * @returns {Promise<Object>} DB 연결 풀 객체
 */
async function getConnectionPool(dburl, dbuser, dbpassword) {
  const poolKey = `${dburl}_${dbuser}`;

  console.log(
    `[DB Connection] getConnectionPool 호출 - dburl: ${dburl}, user: ${dbuser}, poolKey: ${poolKey}`
  );

  // 이미 생성된 풀이 있으면 반환
  if (connectionPools[poolKey]) {
    console.log(`[DB Connection] 기존 연결 풀 반환 - poolKey: ${poolKey}`);
    return connectionPools[poolKey];
  }

  // MySQL 설정
  // dburl 형식: jdbc:mysql://host:port/database 또는 mysql://host:port/database
  const urlMatch = dburl.match(/(?:jdbc:)?mysql:\/\/([^:]+):?(\d+)?\/(.+)/);
  if (!urlMatch) {
    throw new Error("Invalid database URL format");
  }

  const host = urlMatch[1];
  const port = urlMatch[2];
  const database = urlMatch[3];

  // host, port, database 모두 필수
  if (!host || !host.trim()) {
    throw new Error("Database host is required");
  }
  if (!port || !port.trim()) {
    throw new Error("Database port is required");
  }
  if (!database || !database.trim()) {
    throw new Error("Database name is required");
  }

  const portNumber = parseInt(port);
  if (isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
    throw new Error(`Invalid database port: ${port}`);
  }

  console.log(
    `[DB Connection] MySQL 설정 - host: ${host}, port: ${portNumber}, database: ${database}`
  );

  const config = {
    host: host,
    port: portNumber,
    user: dbuser,
    password: dbpassword,
    database: database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    multipleStatements: true,
    dateStrings: true,
    // 타임아웃 설정
    connectTimeout: 10000, // 연결 타임아웃 (10초)
    acquireTimeout: 10000, // 연결 획득 타임아웃 (10초)
    timeout: 60000, // 쿼리 타임아웃 (60초)
    idleTimeout: 600000, // 유휴 연결 타임아웃 (10분)
    // 연결 유지 설정
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectAttributes: {
      program_name: 'seller-engine-db-api',
      environment: 'prod', //isDev ? 'dev' : 'prod', dev운영시 반영
      hostname: os.hostname(),
    },
  };


  console.log(`[DB Connection] 연결 풀 생성 중... - poolKey: ${poolKey}`);
  const pool = mysql.createPool(config);
  

  pool.on("error", (err) => {
    console.error(`[DB Connection] 연결 풀 에러 - poolKey: ${poolKey}`, err.message);
    if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
      // 연결 풀 종료 후 삭제
      if (connectionPools[poolKey]) {
        connectionPools[poolKey].end().catch((e) => {
          console.error(`[DB Connection] 연결 풀 종료 중 에러 - poolKey: ${poolKey}`, e.message);
        });
        delete connectionPools[poolKey];
      }
    }
  });

  connectionPools[poolKey] = pool;
  console.log(`[DB Connection] 연결 풀 생성 완료 - poolKey: ${poolKey}`);

  return pool;
}

/**
 * 연결 가져오기
 * @param {string} dburl - 데이터베이스 URL
 * @param {string} dbuser - 데이터베이스 사용자명
 * @param {string} dbpassword - 데이터베이스 비밀번호
 * @returns {Promise<Object>} DB 연결 객체
 */
async function getConnection(dburl, dbuser, dbpassword) {
  console.log(
    `[DB Connection] getConnection 호출 - dburl: ${dburl}, user: ${dbuser}`
  );
  
  const poolKey = `${dburl}_${dbuser}`;
  let pool = await getConnectionPool(dburl, dbuser, dbpassword);
  
  // 연결 획득 시도 (최대 1회 재시도)
  for (let attempt = 0; attempt < 2; attempt++) {
    let connection = null;
    try {
      connection = await pool.getConnection();
      
      // 연결 유효성 검사
      await connection.ping();
      
      // auto commit 비활성화
      await connection.query("SET AUTOCOMMIT = 0");
      console.log(`[DB Connection] 연결 획득 성공`);
      
      return connection;
    } catch (error) {
      // 연결을 가져온 후 에러 발생 시 연결 해제
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          console.error(`[DB Connection] 연결 해제 중 에러:`, releaseError.message);
        }
      }
      
      // 연결 문제 발생 시 풀 재생성 후 재시도
      if (attempt === 0 && (
        error.code === "PROTOCOL_CONNECTION_LOST" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT"
      )) {
        console.log(`[DB Connection] 연결 문제 감지, 풀 재생성 후 재시도...`);
        if (connectionPools[poolKey]) {
          try {
            await connectionPools[poolKey].end();
          } catch (e) {
            // 무시
          }
          delete connectionPools[poolKey];
        }
        pool = await getConnectionPool(dburl, dbuser, dbpassword);
        continue;
      }
      throw error;
    }
  }
}

/**
 * 연결 풀 종료
 * @param {string} dburl - 데이터베이스 URL
 * @param {string} dbuser - 데이터베이스 사용자명
 */
async function closePool(dburl, dbuser) {
  const poolKey = `${dburl}_${dbuser}`;
  console.log(
    `[DB Connection] closePool 호출 - dburl: ${dburl}, user: ${dbuser}, poolKey: ${poolKey}`
  );
  if (connectionPools[poolKey]) {
    console.log(`[DB Connection] 연결 풀 종료 중... - poolKey: ${poolKey}`);
    await connectionPools[poolKey].end();
    delete connectionPools[poolKey];
    console.log(`[DB Connection] 연결 풀 종료 완료 - poolKey: ${poolKey}`);
  } else {
    console.log(`[DB Connection] 종료할 연결 풀이 없음 - poolKey: ${poolKey}`);
  }
}

module.exports = {
  getConnectionPool,
  getConnection,
  closePool,
};
