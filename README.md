# SELLER_ENGINE DB API

구글 스프레드시트에서 사용하던 Db 클래스를 Node.js API 서버로 분리한 프로젝트입니다.

## 구조

- `server.js`: Express API 서버
- `db-connection.js`: DB 연결 관리 모듈
- `db-service.js`: DB 작업 서비스 모듈
- `sheet-client.js`: 구글 스프레드시트용 클라이언트 클래스

## 설치

```bash
npm install
```

## 서버 실행

```bash
npm start
```

개발 모드 (nodemon):

```bash
npm run dev
```

서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 개발 중 임시 도메인 설정 (ngrok)

구글 스프레드시트에서 API를 호출하려면 공개 URL이 필요합니다. 개발 중에는 ngrok을 사용하여 임시 도메인을 받을 수 있습니다.

### 1. ngrok 설치

**macOS (Homebrew):**

```bash
brew install ngrok
```

**또는 직접 다운로드:**

- https://ngrok.com/download 에서 다운로드
- 압축 해제 후 실행 파일을 PATH에 추가

### 2. ngrok 사용 방법

**방법 1: 별도 터미널에서 실행**

```bash
# 터미널 1: 서버 실행
npm start

# 터미널 2: ngrok 실행
ngrok http 3000
```

**방법 2: 한 번에 실행 (서버와 ngrok 동시 실행)**

```bash
npm run tunnel
```

ngrok 실행 후 다음과 같은 출력이 나타납니다:

```
Forwarding  https://xxxx-xxx-xxx-xxx.ngrok-free.app -> http://localhost:3000
```

이 `https://xxxx-xxx-xxx-xxx.ngrok-free.app` URL을 구글 스프레드시트 설정에 사용하세요.

### 3. 무료 계정 vs 유료 계정

- **무료 계정**: 매번 다른 URL이 생성되며, 세션이 2시간마다 만료됩니다.
- **유료 계정**: 고정 도메인 사용 가능 (선택사항)

### 4. 대안: localtunnel (더 간단한 방법)

ngrok 대신 localtunnel을 사용할 수도 있습니다:

```bash
# 설치
npm install -g localtunnel

# 사용
lt --port 3000
```

## 구글 스프레드시트 설정

1. `sheet-client.js` 파일을 구글 Apps Script 프로젝트에 추가합니다.

2. 스크립트 속성에 API URL을 설정합니다:

   ```javascript
   PropertiesService.getScriptProperties().setProperty(
     "API_URL",
     "http://your-server-url:3000"
   );
   ```

3. 기존 코드에서 `sheet.js` 대신 `sheet-client.js`를 사용합니다.

## API 엔드포인트

모든 API 엔드포인트는 POST 방식으로 동작하며, 다음 형식의 요청을 받습니다:

```json
{
  "dburl": "jdbc:mysql://host:port/database",
  "dbuser": "username",
  "dbpassword": "password",
  ...기타 파라미터
}
```

### 주요 엔드포인트

- `POST /api/table_info`: 테이블 정보 조회
- `POST /api/query_by_table`: 테이블로 쿼리 실행
- `POST /api/query_by_procedure`: 프로시저 실행
- `POST /api/upload`: 데이터 업로드
- `POST /api/execute_sql`: SQL 실행 (UPDATE, DELETE, INSERT)

전체 API 목록은 `server.js`를 참조하세요.
