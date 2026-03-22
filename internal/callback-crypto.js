/**
 * 回调加解密（对应企业微信文档「消息加解密」；Maven 工程中通常落在 common / 回调适配层）
 * @see https://developer.work.weixin.qq.com/document/path/90930
 */
import crypto from "crypto";

function sha1Hex(str) {
  return crypto.createHash("sha1").update(str).digest("hex");
}

export function computeMsgSignature(token, timestamp, nonce, encrypt) {
  const arr = [token, String(timestamp), String(nonce), encrypt].sort();
  return sha1Hex(arr.join(""));
}

export function verifyMsgSignature(token, timestamp, nonce, encrypt, msgSignature) {
  if (!msgSignature) return false;
  return computeMsgSignature(token, timestamp, nonce, encrypt) === msgSignature;
}

function pkcs7Unpad(buf) {
  if (!buf?.length) return buf;
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

export function decryptPayload(encodingAESKey, encryptBase64) {
  const key = Buffer.from(encodingAESKey + "=", "base64");
  if (key.length !== 32) {
    throw new Error("WeCom: EncodingAESKey 解码后长度应为 32 字节");
  }
  const iv = key.subarray(0, 16);
  const encrypted = Buffer.from(encryptBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  let buf = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  buf = pkcs7Unpad(buf);
  if (buf.length < 20) {
    throw new Error("WeCom: 解密后数据过短");
  }
  const msgLen = buf.readUInt32BE(16);
  const message = buf.subarray(20, 20 + msgLen).toString("utf8");
  const corpId = buf.subarray(20 + msgLen).toString("utf8");
  return { message, corpId };
}

export function decryptAndVerifyCorp(encodingAESKey, encryptBase64, expectCorpId) {
  const { message, corpId } = decryptPayload(encodingAESKey, encryptBase64);
  if (expectCorpId && corpId && corpId !== expectCorpId) {
    throw new Error(`WeCom: corpId 不匹配 (期望 ${expectCorpId}, 得到 ${corpId})`);
  }
  return message;
}
