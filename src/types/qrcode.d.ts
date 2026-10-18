declare module "qrcode" {
  const QRCode: {toString(text:string,options:{type:"svg";errorCorrectionLevel?:"L"|"M"|"Q"|"H";margin?:number;width?:number}):Promise<string>};
  export default QRCode;
}
