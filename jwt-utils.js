const crypto = require('crypto');

/**
 * Base64 URL 인코딩 함수
 * @param {string|Buffer} data - 인코딩할 데이터
 * @return {string} Base64 URL 인코딩된 문자열
 */
function base64UrlEncode(data) {
  let base64;
  
  if (typeof data === 'string') {
    base64 = Buffer.from(data).toString('base64');
  } else {
    base64 = data.toString('base64');
  }
  
  // Base64 URL 안전 문자로 변환
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64 URL 디코딩 함수
 * @param {string} data - 디코딩할 데이터
 * @return {string} 디코딩된 문자열
 */
function base64UrlDecode(data) {
  // Base64 URL 문자를 일반 Base64로 변환
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  
  // 패딩 추가
  while (base64.length % 4) {
    base64 += '=';
  }
  
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * JWT 토큰 검증 및 디코딩 함수
 * @param {string} token - 검증할 JWT 토큰
 * @return {object} 디코딩된 payload 또는 null
 */
function verifyJWT(token) {
  try {
    const secretKey = 'K8mP9xN2vQ5wL7jR4tY6uE3sA1dF0gH9bV8cX2zM5nB7kJ4pW6qT3yU1iO0eR8aS';
    
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const headerEncoded = parts[0];
    const payloadEncoded = parts[1];
    const signatureEncoded = parts[2];
    
    // 서명 검증 (먼저 수행 - payload가 조작되지 않았는지 확인)
    const signatureInput = headerEncoded + '.' + payloadEncoded;
    const signature = crypto.createHmac('sha256', secretKey)
      .update(signatureInput)
      .digest();
    const expectedSignature = base64UrlEncode(signature);
    
    if (signatureEncoded !== expectedSignature) {
      throw new Error('Invalid signature');
    }
    
    // Payload 디코딩
    const payloadJson = base64UrlDecode(payloadEncoded);
    const payload = JSON.parse(payloadJson);
    
    // 만료 시간 검증 (서명 검증 후에 수행)
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentTime) {
      throw new Error('Token expired');
    }
    
    return payload;
    
  } catch (e) {
    console.log('JWT verification failed: ' + e.message);
    return null;
  }
}

// 모듈로 내보내기
module.exports = {
  verifyJWT,
  base64UrlEncode,
  base64UrlDecode
};

