export type GetCertificatesRequest = {
  id?: string;
  aki?: string;
  serial?: string;
  revoked_start?: string;
  revoked_end?: string;
  expired_start?: string;
  expired_end?: string;
  notrevoked?: boolean;
  notexpired?: boolean;
  ca?: string;
};

export type CertificateResponse = {
  caname: string;
  certs: { PEM: string }[];
};

export type FabricIdentity = {
  id: string;
  type: string;
  affiliation: string;
  attrs: { name: string; value: string }[];
  max_enrollments: number;
};

export type IdentityResponse = {
  caname: string;
  identities: FabricIdentity[];
};
