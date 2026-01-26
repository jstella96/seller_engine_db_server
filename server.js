/**
 * DB API 서버
 * 구글 스프레드시트에서 사용하는 Db 클래스의 모든 기능을 API로 제공합니다.
 */

const express = require("express");
const cors = require("cors");
const { getConnection } = require("./db-connection");
const dbService = require("./db-service");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Express 4.16.0+ 부터 body-parser가 내장되어 있음
// limit: 50mb - 벌크 쿼리 처리를 위해 큰 크기 설정
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/**
 * DB Connection 자동 관리 래퍼 함수
 * @param {Function} handler - (connection, req, res) => Promise<void>
 * @returns {Function} Express 라우트 핸들러
 */
function withConnection(handler) {
  return async (req, res) => {
    let connection;
    try {
      const { dburl, dbuser, dbpassword } = req.body;
      
      if (!dburl || !dbuser || !dbpassword) {
        return res.status(400).json({
          success: false,
          error: "필수 파라미터가 누락되었습니다: dburl, dbuser, dbpassword",
        });
      }

      connection = await getConnection(dburl, dbuser, dbpassword);
      await handler(connection, req, res);
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("[API] Rollback 오류:", rollbackError);
        }
      }
      console.error("[API] 오류:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          console.error("[API] Connection release 오류:", releaseError);
        }
      }
    }
  };
}

/**
 * 헬스체크
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "seller-engine-api",
    time: new Date().toISOString(),
  });
});

/**
 * 에러 핸들러 미들웨어
 */
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message });
});


/**
 * 프로시저 호출 (prepared statement)
 * POST /api/call_prepared_statement
 * Body: { dburl, dbuser, dbpassword, command }
 */
app.post(
  "/api/call_prepared_statement",
  withConnection(async (connection, req, res) => {
    const { command } = req.body;
    const rows = await dbService.callPreparedStatement(connection, command);
    res.json({ success: true, data: rows });
  })
);



/**
 * 프로시저로 쿼리 실행
 * POST /api/query_by_procedure
 * Body: { dburl, dbuser, dbpassword, proc, sql, paramInfo, params (배열) }
 */
app.post(
  "/procedure",
  withConnection(async (connection, req, res) => {
    const { sql, params } = req.body;
    console.log(
      `[API] query_by_procedure 요청 body:`,
      JSON.stringify(req.body, null, 2)
    );
    console.log(`[API] query_by_procedure 호출 - sql: ${sql}`);

    const paramsArray = Array.isArray(params) ? params : [];
    const sqlStr = String(sql || "");

    const { rows, fields, resultSet } =
      await dbService.queryByProcedureWithParamsArray(
        connection,
        sqlStr,
        paramsArray
      );

    res.json({ success: true, data: { rows, fields, resultSet } });
  })
);



/**
 * INSERT/UPDATE/DELETE 쿼리 실행
 * POST /execute
 * Body: { dburl, dbuser, dbpassword, sql, params (배열) }
 */
app.post(
  "/execute",
  withConnection(async (connection, req, res) => {
    const { sql, params } = req.body;

    const paramsArray = Array.isArray(params) ? params : [];
    const result = await dbService.executeQuery(connection, sql, paramsArray);

    res.json({
      success: true,
      data: {
        rows: [],
        fields: [],
        resultSet: result,
      },
    });
  })
);



/**
 * SELECT 쿼리 실행
 * POST /select
 * Body: { dburl, dbuser, dbpassword, sql, params (배열) }
 */
app.post(
  "/select",
  withConnection(async (connection, req, res) => {
    const { sql, maxRows, params } = req.body;
    console.log(`[API] select 요청 body:`, JSON.stringify(req.body, null, 2));
    console.log(`[API] select 호출 - sql: ${sql}`);

    const paramsArray = Array.isArray(params) ? params : [];
    const [rows, fields] = await dbService.executeSelect(
      connection,
      sql,
      maxRows,
      paramsArray
    );

    // SELECT는 읽기 전용이므로 commit 불필요
    res.json({
      success: true,
      data: {
        rows,
        fields: fields,
        resultSet: null,
      },
    });
  })
);


// 서버 시작
app.listen(PORT, () => {
  console.log(`DB API Server is running on port ${PORT}`);
});

module.exports = app;
