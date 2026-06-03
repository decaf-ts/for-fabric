export function getOrgEnv(orgWithCap: string) {
  const orgName = orgWithCap.toLowerCase();
  return {
    mspMap: {
      PharmaledgerassocMSP: [
        {
          endpoint: "localhost:7050",
          alias: "pharmaledgerassoc-peer-0",
          tlsCert:
            "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/docker/docker-data/pla-peer-0-tls.pem",
        },
        {
          endpoint: "localhost:7051",
          alias: "pharmaledgerassoc-peer-1",
          tlsCert:
            "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/docker/docker-data/pla-peer-1-tls.pem",
        },
        {
          endpoint: "localhost:7052",
          alias: "pharmaledgerassoc-peer-2",
          tlsCert:
            "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/docker/docker-data/pla-peer-2-tls.pem",
        },
      ],
    } as any,
    legacyMspCount: 2, // need to match the channel policy. they'll be selected at random from the list above
    allowGatewayOverride: true,
    cryptoPath:
      "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/toolkit/docker/docker-data",
    keyCertOrDirectoryPath:
      "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/toolkit/docker/docker-data/client/msp/keystore",
    certCertOrDirectoryPath:
      "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/toolkit/docker/docker-data/client/msp/signcerts",
    tlsCert:
      "/home/tvenceslau/local-workspace/pharmaledger/PTP-Workspace/toolkit/docker/docker-data/tls-cert.pem",
    tlsVerify: true,
    peerEndpoint: "localhost:8250",
    peerHostAlias: `${orgName}-peer-0`,
    chaincodeName: "ptp-chaincode",
    caEndpoint: "https://localhost:8210",
    ca: `${orgName}-ca`,
    mspId: `${orgWithCap}MSP`,
    channel: "ptp-channel",
    sizeLimit: 15,
    evaluateTimeout: 2000,
    endorseTimeout: 15000,
    submitTimeout: 5000,
    commitTimeout: 30000,
  };
}
