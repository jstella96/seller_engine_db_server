# SELLER_ENGINE DB API

구글 스프레드시트에서 사용하던 Db 클래스를 Node.js API 서버로 분리한 프로젝트입니다.

## 구조

- `server.js`: Express API 서버
- `db-connection.js`: DB 연결 관리 모듈
- `db-service.js`: DB 작업 서비스 모듈


## 배포

```
# 이미지 빌드 및 컨테이너 시작
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 컨테이너 중지
docker-compose down

# 컨테이너 재시작
docker-compose restart

# 이미지 재빌드 후 시작
docker-compose up -d --build
```