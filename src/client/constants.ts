export enum HFCAIdentityType {
  PEER = "peer",
  ORDERER = "orderer",
  CLIENT = "client",
  USER = "user",
  ADMIN = "admin",
}

export enum HFCAIdentityAttributes {
  HFREGISTRARROLES = "hf.Registrar.Roles",
  HFREGISTRARDELEGATEROLES = "hf.Registrar.DelegateRoles",
  HFREGISTRARATTRIBUTES = "hf.Registrar.Attributes",
  HFINTERMEDIATECA = "hf.IntermediateCA",
  HFREVOKER = "hf.Revoker",
  HFAFFILIATIONMGR = "hf.AffiliationMgr",
  HFGENCRL = "hf.GenCRL",
}
