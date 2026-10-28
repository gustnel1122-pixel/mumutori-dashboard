// Values are loaded from authenticated settings, never from the public source tree.
export function validQuoteSettings(v){
 return !!v&&v.schema===1&&Number.isFinite(v.purchaseAmount)&&v.purchaseAmount>0&&
  Number.isFinite(v.customsAmount)&&v.customsAmount>=0&&Number.isFinite(v.freightAmount)&&v.freightAmount>=0&&
  typeof v.basis==='string'&&v.basis.length>0&&v.basis.length<=100;
}
export function quoteComparisons(purchase,weightShipping,quantity,settings){
 if(!validQuoteSettings(settings)||!Number.isFinite(purchase)||purchase<0||!Number.isFinite(weightShipping)||weightShipping<0||!(quantity>0))return null;
 const customsRatio=settings.customsAmount/settings.purchaseAmount,freightRatio=settings.freightAmount/settings.purchaseAmount;
 const customs=purchase*customsRatio,actualShipping=purchase*freightRatio,weightTotal=purchase+weightShipping+customs,actualTotal=purchase+actualShipping+customs;
 return {customsRatio,freightRatio,customs,actualShipping,weightTotal,actualTotal,weightPer:weightTotal/quantity,actualPer:actualTotal/quantity,basis:settings.basis};
}
