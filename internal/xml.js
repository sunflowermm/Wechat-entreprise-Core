/**
 * 回调 XML 轻量解析（无额外依赖，对应 SDK 中 XStream 解析的极简子集）
 */

export function extractCdata(xml, tag) {
  if (!xml || !tag) return "";
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const m = xml.match(cdata);
  if (m) return m[1].trim();
  const plain = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m2 = xml.match(plain);
  return m2 ? m2[1].trim() : "";
}

export function extractEncryptFromCallbackXml(xml) {
  return extractCdata(xml, "Encrypt");
}
