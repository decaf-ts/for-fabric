# Dependencies

## Dependency tree
```sh
npm warn Expanding --prod to --production. This will stop working in the next major version of npm.
npm warn config production Use `--omit=dev` instead.
@decaf-ts/for-fabric@0.1.74 /home/tvenceslau/local-workspace/decaf-ts/for-fabric
├─┬ @decaf-ts/core@0.8.26 invalid: "latest" from the root project
│ ├── @decaf-ts/db-decorators@0.8.16 deduped
│ ├── @decaf-ts/decoration@0.8.7 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core
│ ├── @decaf-ts/injectable-decorators@1.9.10 deduped
│ └── @decaf-ts/transactional-decorators@0.3.5 deduped
├─┬ @decaf-ts/db-decorators@0.8.16
│ ├── @decaf-ts/decoration@0.8.7 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators
│ ├── @decaf-ts/injectable-decorators@1.9.10 deduped
│ └── @decaf-ts/logging@0.10.8 deduped
├─┬ @decaf-ts/decoration@0.8.7 invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators
│ └── reflect-metadata@0.2.2
├─┬ @decaf-ts/decorator-validation@1.11.16 invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators
│ └── @decaf-ts/decoration@0.8.7 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators, "latest" from node_modules/@decaf-ts/decorator-validation
├─┬ @decaf-ts/for-couchdb@0.4.32 invalid: "latest" from the root project
│ ├── @decaf-ts/core@0.8.26 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/for-couchdb
│ ├── @decaf-ts/db-decorators@0.8.16 deduped
│ ├── @decaf-ts/decoration@0.8.7 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators, "latest" from node_modules/@decaf-ts/decorator-validation, "latest" from node_modules/@decaf-ts/for-couchdb
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators, "latest" from node_modules/@decaf-ts/for-couchdb
│ ├── @decaf-ts/injectable-decorators@1.9.10 deduped
│ ├── @decaf-ts/logging@0.10.8 deduped
│ └── @decaf-ts/transactional-decorators@0.3.5 deduped
├─┬ @decaf-ts/injectable-decorators@1.9.10
│ └── @decaf-ts/decoration@0.8.7 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators, "latest" from node_modules/@decaf-ts/decorator-validation, "latest" from node_modules/@decaf-ts/for-couchdb, "latest" from node_modules/@decaf-ts/injectable-decorators
├─┬ @decaf-ts/logging@0.10.8
│ ├─┬ pino@10.1.0
│ │ ├── @pinojs/redact@0.4.0
│ │ ├── atomic-sleep@1.0.0
│ │ ├── on-exit-leak-free@2.1.2
│ │ ├─┬ pino-abstract-transport@2.0.0
│ │ │ └── split2@4.2.0
│ │ ├── pino-std-serializers@7.0.0
│ │ ├── process-warning@5.0.0
│ │ ├── quick-format-unescaped@4.0.4
│ │ ├── real-require@0.2.0
│ │ ├── safe-stable-stringify@2.5.0
│ │ ├─┬ sonic-boom@4.2.0
│ │ │ └── atomic-sleep@1.0.0 deduped
│ │ └─┬ thread-stream@3.1.0
│ │   └── real-require@0.2.0 deduped
│ ├── styled-string-builder@1.5.1
│ ├── typed-object-accumulator@0.1.5
│ └─┬ winston@3.18.3
│   ├── @colors/colors@1.6.0
│   ├─┬ @dabh/diagnostics@2.0.8
│   │ ├─┬ @so-ric/colorspace@1.1.6
│   │ │ ├─┬ color@5.0.2
│   │ │ │ ├─┬ color-convert@3.1.2
│   │ │ │ │ └── color-name@2.0.2
│   │ │ │ └─┬ color-string@2.1.2
│   │ │ │   └── color-name@2.0.2
│   │ │ └── text-hex@1.0.0
│   │ ├── enabled@2.0.0
│   │ └── kuler@2.0.0
│   ├── async@3.2.6
│   ├── is-stream@2.0.1
│   ├─┬ logform@2.7.0
│   │ ├── @colors/colors@1.6.0 deduped
│   │ ├── @types/triple-beam@1.3.5
│   │ ├── fecha@4.2.3
│   │ ├── ms@2.1.3
│   │ ├── safe-stable-stringify@2.5.0 deduped
│   │ └── triple-beam@1.4.1 deduped
│   ├─┬ one-time@1.0.0
│   │ └── fn.name@1.1.0
│   ├─┬ readable-stream@3.6.2
│   │ ├── inherits@2.0.4 deduped
│   │ ├─┬ string_decoder@1.3.0
│   │ │ └── safe-buffer@5.2.1
│   │ └── util-deprecate@1.0.2
│   ├── safe-stable-stringify@2.5.0 deduped
│   ├── stack-trace@0.0.10
│   ├── triple-beam@1.4.1
│   └─┬ winston-transport@4.9.0
│     ├── logform@2.7.0 deduped
│     ├── readable-stream@3.6.2 deduped
│     └── triple-beam@1.4.1 deduped
├─┬ @decaf-ts/transactional-decorators@0.3.5
│ ├── @decaf-ts/db-decorators@0.8.16 deduped
│ ├── @decaf-ts/decoration@0.8.7 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators, "latest" from node_modules/@decaf-ts/decorator-validation, "latest" from node_modules/@decaf-ts/for-couchdb, "latest" from node_modules/@decaf-ts/injectable-decorators, "latest" from node_modules/@decaf-ts/transactional-decorators
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped invalid: "latest" from the root project, "latest" from node_modules/@decaf-ts/core, "latest" from node_modules/@decaf-ts/db-decorators, "latest" from node_modules/@decaf-ts/for-couchdb, "latest" from node_modules/@decaf-ts/transactional-decorators
│ └── @decaf-ts/injectable-decorators@1.9.10 deduped
├─┬ @grpc/grpc-js@1.14.0
│ ├─┬ @grpc/proto-loader@0.8.0
│ │ ├── lodash.camelcase@4.3.0
│ │ ├── long@5.3.2 deduped
│ │ ├─┬ protobufjs@7.5.4
│ │ │ ├── @protobufjs/aspromise@1.1.2
│ │ │ ├── @protobufjs/base64@1.1.2
│ │ │ ├── @protobufjs/codegen@2.0.4
│ │ │ ├── @protobufjs/eventemitter@1.1.0
│ │ │ ├─┬ @protobufjs/fetch@1.1.0
│ │ │ │ ├── @protobufjs/aspromise@1.1.2 deduped
│ │ │ │ └── @protobufjs/inquire@1.1.0 deduped
│ │ │ ├── @protobufjs/float@1.0.2
│ │ │ ├── @protobufjs/inquire@1.1.0
│ │ │ ├── @protobufjs/path@1.1.2
│ │ │ ├── @protobufjs/pool@1.1.0
│ │ │ ├── @protobufjs/utf8@1.1.0
│ │ │ ├─┬ @types/node@24.9.1
│ │ │ │ └── undici-types@7.16.0
│ │ │ └── long@5.3.2 deduped
│ │ └── yargs@17.7.2 deduped
│ └── @js-sdsl/ordered-map@4.4.2
├─┬ @hyperledger/fabric-gateway@1.9.0
│ ├── @grpc/grpc-js@1.14.0 deduped
│ ├─┬ @hyperledger/fabric-protos@0.3.7
│ │ ├── @grpc/grpc-js@1.14.0 deduped
│ │ └── google-protobuf@3.21.4 deduped
│ ├─┬ @noble/curves@1.9.7
│ │ └── @noble/hashes@1.8.0
│ ├── google-protobuf@3.21.4
│ └── pkcs11js@2.1.6 deduped
├─┬ @peculiar/webcrypto@1.5.0
│ ├─┬ @peculiar/asn1-schema@2.6.0
│ │ ├─┬ asn1js@3.0.6
│ │ │ ├── pvtsutils@1.3.6 deduped
│ │ │ ├── pvutils@1.1.5
│ │ │ └── tslib@2.8.1 deduped
│ │ ├── pvtsutils@1.3.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├─┬ @peculiar/json-schema@1.1.12
│ │ └── tslib@2.8.1 deduped
│ ├─┬ pvtsutils@1.3.6
│ │ └── tslib@2.8.1 deduped
│ ├── tslib@2.8.1
│ └─┬ webcrypto-core@1.8.1
│   ├── @peculiar/asn1-schema@2.6.0 deduped
│   ├── @peculiar/json-schema@1.1.12 deduped
│   ├── asn1js@3.0.6 deduped
│   ├── pvtsutils@1.3.6 deduped
│   └── tslib@2.8.1 deduped
├─┬ @peculiar/x509@1.14.2
│ ├─┬ @peculiar/asn1-cms@2.6.0
│ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ ├─┬ @peculiar/asn1-x509-attr@2.6.0
│ │ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ │ ├── asn1js@3.0.6 deduped
│ │ │ └── tslib@2.8.1 deduped
│ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ ├── asn1js@3.0.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├─┬ @peculiar/asn1-csr@2.6.0
│ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ ├── asn1js@3.0.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├─┬ @peculiar/asn1-ecc@2.6.0
│ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ ├── asn1js@3.0.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├─┬ @peculiar/asn1-pkcs9@2.6.0
│ │ ├── @peculiar/asn1-cms@2.6.0 deduped
│ │ ├─┬ @peculiar/asn1-pfx@2.6.0
│ │ │ ├── @peculiar/asn1-cms@2.6.0 deduped
│ │ │ ├── @peculiar/asn1-pkcs8@2.6.0 deduped
│ │ │ ├── @peculiar/asn1-rsa@2.6.0 deduped
│ │ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ │ ├── asn1js@3.0.6 deduped
│ │ │ └── tslib@2.8.1 deduped
│ │ ├─┬ @peculiar/asn1-pkcs8@2.6.0
│ │ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ │ ├── asn1js@3.0.6 deduped
│ │ │ └── tslib@2.8.1 deduped
│ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ ├── @peculiar/asn1-x509-attr@2.6.0 deduped
│ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ ├── asn1js@3.0.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├─┬ @peculiar/asn1-rsa@2.6.0
│ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ ├── @peculiar/asn1-x509@2.6.0 deduped
│ │ ├── asn1js@3.0.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├── @peculiar/asn1-schema@2.6.0 deduped
│ ├─┬ @peculiar/asn1-x509@2.6.0
│ │ ├── @peculiar/asn1-schema@2.6.0 deduped
│ │ ├── asn1js@3.0.6 deduped
│ │ ├── pvtsutils@1.3.6 deduped
│ │ └── tslib@2.8.1 deduped
│ ├── pvtsutils@1.3.6 deduped
│ ├── reflect-metadata@0.2.2 deduped
│ ├── tslib@2.8.1 deduped
│ └─┬ tsyringe@4.10.0
│   └── tslib@1.14.1
├─┬ fabric-ca-client@2.2.20
│ ├── fabric-common@2.2.20 deduped
│ ├── jsrsasign@11.1.0
│ ├─┬ url@0.11.4
│ │ ├── punycode@1.4.1
│ │ └─┬ qs@6.14.1
│ │   └─┬ side-channel@1.1.0
│ │     ├── es-errors@1.3.0
│ │     ├── object-inspect@1.13.4
│ │     ├─┬ side-channel-list@1.0.0
│ │     │ ├── es-errors@1.3.0 deduped
│ │     │ └── object-inspect@1.13.4 deduped
│ │     ├─┬ side-channel-map@1.0.1
│ │     │ ├─┬ call-bound@1.0.4
│ │     │ │ ├─┬ call-bind-apply-helpers@1.0.2
│ │     │ │ │ ├── es-errors@1.3.0 deduped
│ │     │ │ │ └── function-bind@1.1.2 deduped
│ │     │ │ └── get-intrinsic@1.3.0 deduped
│ │     │ ├── es-errors@1.3.0 deduped
│ │     │ ├─┬ get-intrinsic@1.3.0
│ │     │ │ ├── call-bind-apply-helpers@1.0.2 deduped
│ │     │ │ ├── es-define-property@1.0.1
│ │     │ │ ├── es-errors@1.3.0 deduped
│ │     │ │ ├─┬ es-object-atoms@1.1.1
│ │     │ │ │ └── es-errors@1.3.0 deduped
│ │     │ │ ├── function-bind@1.1.2 deduped
│ │     │ │ ├─┬ get-proto@1.0.1
│ │     │ │ │ ├─┬ dunder-proto@1.0.1
│ │     │ │ │ │ ├── call-bind-apply-helpers@1.0.2 deduped
│ │     │ │ │ │ ├── es-errors@1.3.0 deduped
│ │     │ │ │ │ └── gopd@1.2.0 deduped
│ │     │ │ │ └── es-object-atoms@1.1.1 deduped
│ │     │ │ ├── gopd@1.2.0
│ │     │ │ ├── has-symbols@1.1.0
│ │     │ │ ├── hasown@2.0.2 deduped
│ │     │ │ └── math-intrinsics@1.1.0
│ │     │ └── object-inspect@1.13.4 deduped
│ │     └─┬ side-channel-weakmap@1.0.2
│ │       ├── call-bound@1.0.4 deduped
│ │       ├── es-errors@1.3.0 deduped
│ │       ├── get-intrinsic@1.3.0 deduped
│ │       ├── object-inspect@1.13.4 deduped
│ │       └── side-channel-map@1.0.1 deduped
│ └─┬ winston@2.4.7 invalid: "^2.4.5" from node_modules/fabric-common
│   ├─┬ async@2.6.4
│   │ └── lodash@4.17.23
│   ├── colors@1.0.3
│   ├── cycle@1.0.3
│   ├── eyes@0.1.8
│   ├── isstream@0.1.2
│   └── stack-trace@0.0.10 deduped
├─┬ fabric-common@2.2.20
│ ├── callsite@1.0.0
│ ├─┬ elliptic@6.6.1
│ │ ├── bn.js@4.12.2
│ │ ├── brorand@1.1.0
│ │ ├─┬ hash.js@1.1.7
│ │ │ ├── inherits@2.0.4 deduped
│ │ │ └── minimalistic-assert@1.0.1 deduped
│ │ ├─┬ hmac-drbg@1.0.1
│ │ │ ├── hash.js@1.1.7 deduped
│ │ │ ├── minimalistic-assert@1.0.1 deduped
│ │ │ └── minimalistic-crypto-utils@1.0.1 deduped
│ │ ├── inherits@2.0.4
│ │ ├── minimalistic-assert@1.0.1
│ │ └── minimalistic-crypto-utils@1.0.1
│ ├─┬ fabric-protos@2.2.20
│ │ ├─┬ @grpc/grpc-js@1.9.15
│ │ │ ├── @grpc/proto-loader@0.7.15 deduped
│ │ │ └── @types/node@24.9.1 deduped
│ │ ├─┬ @grpc/proto-loader@0.7.15
│ │ │ ├── lodash.camelcase@4.3.0 deduped
│ │ │ ├── long@5.3.2 deduped
│ │ │ ├── protobufjs@7.5.4 deduped
│ │ │ └── yargs@17.7.2 deduped
│ │ ├── long@5.3.2 deduped
│ │ └── protobufjs@7.5.4 deduped
│ ├── js-sha3@0.9.3
│ ├── jsrsasign@11.1.0 deduped
│ ├── long@5.3.2
│ ├─┬ nconf@0.12.1
│ │ ├── async@3.2.6 deduped
│ │ ├── ini@2.0.0
│ │ ├── secure-keys@1.0.0
│ │ └─┬ yargs@16.2.0
│ │   ├─┬ cliui@7.0.4
│ │   │ ├── string-width@4.2.3 deduped
│ │   │ ├─┬ strip-ansi@6.0.1
│ │   │ │ └── ansi-regex@5.0.1
│ │   │ └─┬ wrap-ansi@7.0.0
│ │   │   ├── ansi-styles@4.3.0 deduped
│ │   │   ├── string-width@4.2.3 deduped
│ │   │   └── strip-ansi@6.0.1 deduped
│ │   ├── escalade@3.2.0 deduped
│ │   ├── get-caller-file@2.0.5 deduped
│ │   ├── require-directory@2.1.1 deduped
│ │   ├─┬ string-width@4.2.3
│ │   │ ├── emoji-regex@8.0.0
│ │   │ ├── is-fullwidth-code-point@3.0.0 deduped
│ │   │ └── strip-ansi@6.0.1 deduped
│ │   ├── y18n@5.0.8 deduped
│ │   └── yargs-parser@20.2.9
│ ├── pkcs11js@2.1.6 deduped invalid: "^1.3.0" from node_modules/fabric-common
│ ├── promise-settle@0.3.0
│ ├── sjcl@1.0.8
│ ├── winston@2.4.7 deduped invalid: "^2.4.5" from node_modules/fabric-common
│ └── yn@4.0.0
├─┬ fabric-contract-api@2.5.8
│ ├── class-transformer@0.4.0
│ ├── fabric-shim-api@2.5.8
│ ├── fast-safe-stringify@2.1.1
│ ├── get-params@0.1.2
│ ├── reflect-metadata@0.1.14
│ └─┬ winston@3.18.3
│   ├── @colors/colors@1.6.0 deduped
│   ├── @dabh/diagnostics@2.0.8 deduped
│   ├── async@3.2.6 deduped
│   ├── is-stream@2.0.1 deduped
│   ├── logform@2.7.0 deduped
│   ├── one-time@1.0.0 deduped
│   ├── readable-stream@3.6.2 deduped
│   ├── safe-stable-stringify@2.5.0 deduped
│   ├── stack-trace@0.0.10 deduped
│   ├── triple-beam@1.4.1 deduped
│   └── winston-transport@4.9.0 deduped
├─┬ fabric-network@2.2.20
│ ├── fabric-common@2.2.20 deduped
│ ├── fabric-protos@2.2.20 deduped
│ ├── long@5.3.2 deduped
│ └─┬ nano@10.1.4
│   ├─┬ axios@1.12.2
│   │ ├── follow-redirects@1.15.11
│   │ ├─┬ form-data@4.0.4
│   │ │ ├── asynckit@0.4.0
│   │ │ ├─┬ combined-stream@1.0.8
│   │ │ │ └── delayed-stream@1.0.0
│   │ │ ├─┬ es-set-tostringtag@2.1.0
│   │ │ │ ├── es-errors@1.3.0 deduped
│   │ │ │ ├── get-intrinsic@1.3.0 deduped
│   │ │ │ ├─┬ has-tostringtag@1.0.2
│   │ │ │ │ └── has-symbols@1.1.0 deduped
│   │ │ │ └── hasown@2.0.2 deduped
│   │ │ ├─┬ hasown@2.0.2
│   │ │ │ └── function-bind@1.1.2
│   │ │ └─┬ mime-types@2.1.35
│   │ │   └── mime-db@1.52.0
│   │ └── proxy-from-env@1.1.0
│   ├── node-abort-controller@3.1.1
│   └── qs@6.14.1 deduped
├─┬ fabric-shim@2.5.8
│ ├─┬ @fidm/x509@1.2.1
│ │ ├── @fidm/asn1@1.0.4
│ │ └── tweetnacl@1.0.3
│ ├── @grpc/grpc-js@1.14.0 deduped
│ ├─┬ @hyperledger/fabric-protos@0.2.2
│ │ ├── @grpc/grpc-js@1.14.0 deduped
│ │ └── google-protobuf@3.21.4 deduped
│ ├── @types/node@16.18.126
│ ├─┬ ajv@6.12.6
│ │ ├── fast-deep-equal@3.1.3
│ │ ├── fast-json-stable-stringify@2.1.0
│ │ ├── json-schema-traverse@0.4.1
│ │ └─┬ uri-js@4.4.1
│ │   └── punycode@2.3.1
│ ├── fabric-contract-api@2.5.8 deduped
│ ├── fabric-shim-api@2.5.8 deduped
│ ├── fast-safe-stringify@2.1.1 deduped
│ ├── long@5.3.2 deduped
│ ├── reflect-metadata@0.1.14
│ ├─┬ winston@3.18.3
│ │ ├── @colors/colors@1.6.0 deduped
│ │ ├── @dabh/diagnostics@2.0.8 deduped
│ │ ├── async@3.2.6 deduped
│ │ ├── is-stream@2.0.1 deduped
│ │ ├── logform@2.7.0 deduped
│ │ ├── one-time@1.0.0 deduped
│ │ ├── readable-stream@3.6.2 deduped
│ │ ├── safe-stable-stringify@2.5.0 deduped
│ │ ├── stack-trace@0.0.10 deduped
│ │ ├── triple-beam@1.4.1 deduped
│ │ └── winston-transport@4.9.0 deduped
│ ├── yargs-parser@21.1.1
│ └─┬ yargs@17.7.2
│   ├─┬ cliui@8.0.1
│   │ ├─┬ string-width@4.2.3
│   │ │ ├── emoji-regex@8.0.0
│   │ │ ├── is-fullwidth-code-point@3.0.0 deduped
│   │ │ └── strip-ansi@6.0.1 deduped
│   │ ├─┬ strip-ansi@6.0.1
│   │ │ └── ansi-regex@5.0.1
│   │ └─┬ wrap-ansi@7.0.0
│   │   ├─┬ ansi-styles@4.3.0
│   │   │ └─┬ color-convert@2.0.1
│   │   │   └── color-name@1.1.4
│   │   ├── string-width@4.2.3 deduped
│   │   └── strip-ansi@6.0.1 deduped
│   ├── escalade@3.2.0
│   ├── get-caller-file@2.0.5
│   ├── require-directory@2.1.1
│   ├─┬ string-width@4.2.3
│   │ ├── emoji-regex@8.0.0
│   │ ├── is-fullwidth-code-point@3.0.0
│   │ └─┬ strip-ansi@6.0.1
│   │   └── ansi-regex@5.0.1
│   ├── y18n@5.0.8
│   └── yargs-parser@21.1.1 deduped
├── json-stringify-deterministic@1.0.12
├── pkcs11js@2.1.6 invalid: "^1.3.0" from node_modules/fabric-common
├─┬ rollup-plugin-ts@3.4.5
│ ├─┬ @babel/core@7.28.5
│ │ ├─┬ @babel/code-frame@7.27.1
│ │ │ ├── @babel/helper-validator-identifier@7.28.5
│ │ │ ├── js-tokens@4.0.0
│ │ │ └── picocolors@1.1.1
│ │ ├─┬ @babel/generator@7.28.5
│ │ │ ├── @babel/parser@7.28.5 deduped
│ │ │ ├── @babel/types@7.28.5 deduped
│ │ │ ├─┬ @jridgewell/gen-mapping@0.3.13
│ │ │ │ ├── @jridgewell/sourcemap-codec@1.5.5 deduped
│ │ │ │ └── @jridgewell/trace-mapping@0.3.31 deduped
│ │ │ ├─┬ @jridgewell/trace-mapping@0.3.31
│ │ │ │ ├── @jridgewell/resolve-uri@3.1.2
│ │ │ │ └── @jridgewell/sourcemap-codec@1.5.5 deduped
│ │ │ └── jsesc@3.1.0
│ │ ├─┬ @babel/helper-compilation-targets@7.27.2
│ │ │ ├── @babel/compat-data@7.28.5
│ │ │ ├── @babel/helper-validator-option@7.27.1
│ │ │ ├── browserslist@4.27.0 deduped
│ │ │ ├─┬ lru-cache@5.1.1
│ │ │ │ └── yallist@3.1.1
│ │ │ └── semver@6.3.1
│ │ ├─┬ @babel/helper-module-transforms@7.28.3
│ │ │ ├── @babel/core@7.28.5 deduped
│ │ │ ├─┬ @babel/helper-module-imports@7.27.1
│ │ │ │ ├── @babel/traverse@7.28.5 deduped
│ │ │ │ └── @babel/types@7.28.5 deduped
│ │ │ ├── @babel/helper-validator-identifier@7.28.5 deduped
│ │ │ └── @babel/traverse@7.28.5 deduped
│ │ ├─┬ @babel/helpers@7.28.4
│ │ │ ├── @babel/template@7.27.2 deduped
│ │ │ └── @babel/types@7.28.5 deduped
│ │ ├─┬ @babel/parser@7.28.5
│ │ │ └── @babel/types@7.28.5 deduped
│ │ ├─┬ @babel/template@7.27.2
│ │ │ ├── @babel/code-frame@7.27.1 deduped
│ │ │ ├── @babel/parser@7.28.5 deduped
│ │ │ └── @babel/types@7.28.5 deduped
│ │ ├─┬ @babel/traverse@7.28.5
│ │ │ ├── @babel/code-frame@7.27.1 deduped
│ │ │ ├── @babel/generator@7.28.5 deduped
│ │ │ ├── @babel/helper-globals@7.28.0
│ │ │ ├── @babel/parser@7.28.5 deduped
│ │ │ ├── @babel/template@7.27.2 deduped
│ │ │ ├── @babel/types@7.28.5 deduped
│ │ │ └── debug@4.4.3 deduped
│ │ ├─┬ @babel/types@7.28.5
│ │ │ ├── @babel/helper-string-parser@7.27.1
│ │ │ └── @babel/helper-validator-identifier@7.28.5 deduped
│ │ ├─┬ @jridgewell/remapping@2.3.5
│ │ │ ├── @jridgewell/gen-mapping@0.3.13 deduped
│ │ │ └── @jridgewell/trace-mapping@0.3.31 deduped
│ │ ├── convert-source-map@2.0.0
│ │ ├─┬ debug@4.4.3
│ │ │ └── ms@2.1.3 deduped
│ │ ├── gensync@1.0.0-beta.2
│ │ ├── json5@2.2.3
│ │ └── semver@6.3.1
│ ├── UNMET OPTIONAL DEPENDENCY @babel/plugin-transform-runtime@>=7.x
│ ├── UNMET OPTIONAL DEPENDENCY @babel/preset-env@>=7.x
│ ├── UNMET OPTIONAL DEPENDENCY @babel/preset-typescript@>=7.x
│ ├── UNMET OPTIONAL DEPENDENCY @babel/runtime@>=7.x
│ ├─┬ @rollup/pluginutils@5.3.0
│ │ ├── @types/estree@1.0.8
│ │ ├── estree-walker@2.0.2
│ │ ├── picomatch@4.0.3
│ │ └── rollup@4.52.5 deduped
│ ├── UNMET OPTIONAL DEPENDENCY @swc/core@>=1.x
│ ├── UNMET OPTIONAL DEPENDENCY @swc/helpers@>=0.2
│ ├── @wessberg/stringutil@1.0.19
│ ├── ansi-colors@4.1.3
│ ├─┬ browserslist-generator@2.3.0
│ │ ├── @mdn/browser-compat-data@5.7.6
│ │ ├── @types/object-path@0.11.4
│ │ ├── @types/semver@7.7.1
│ │ ├── @types/ua-parser-js@0.7.39
│ │ ├── browserslist@4.27.0 deduped
│ │ ├── caniuse-lite@1.0.30001751
│ │ ├── isbot@3.8.0
│ │ ├── object-path@0.11.8
│ │ ├── semver@7.7.3
│ │ └── ua-parser-js@1.0.41
│ ├─┬ browserslist@4.27.0
│ │ ├── baseline-browser-mapping@2.8.20
│ │ ├── caniuse-lite@1.0.30001751 deduped
│ │ ├── electron-to-chromium@1.5.240
│ │ ├── node-releases@2.0.26
│ │ └─┬ update-browserslist-db@1.1.4
│ │   ├── browserslist@4.27.0 deduped
│ │   ├── escalade@3.2.0 deduped
│ │   └── picocolors@1.1.1 deduped
│ ├─┬ compatfactory@3.0.0
│ │ ├── helpertypes@0.0.19
│ │ └── typescript@5.9.3 deduped
│ ├─┬ crosspath@2.0.0
│ │ └── @types/node@17.0.45
│ ├─┬ magic-string@0.30.21
│ │ └── @jridgewell/sourcemap-codec@1.5.5
│ ├─┬ rollup@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-android-arm-eabi@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-android-arm64@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-darwin-arm64@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-darwin-x64@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-freebsd-arm64@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-freebsd-x64@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm-gnueabihf@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm-musleabihf@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm64-gnu@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm64-musl@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-loong64-gnu@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-ppc64-gnu@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-riscv64-gnu@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-riscv64-musl@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-s390x-gnu@4.52.5
│ │ ├── @rollup/rollup-linux-x64-gnu@4.52.5
│ │ ├── @rollup/rollup-linux-x64-musl@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-openharmony-arm64@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-win32-arm64-msvc@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-win32-ia32-msvc@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-win32-x64-gnu@4.52.5
│ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-win32-x64-msvc@4.52.5
│ │ ├── @types/estree@1.0.8 deduped
│ │ └── UNMET OPTIONAL DEPENDENCY fsevents@~2.3.2
│ ├─┬ ts-clone-node@3.0.0
│ │ ├── compatfactory@3.0.0 deduped
│ │ └── typescript@5.9.3 deduped
│ ├── tslib@2.8.1 deduped
│ └── typescript@5.9.3
└─┬ sort-keys-recursive@2.1.10
  ├── kind-of@6.0.3
  └─┬ sort-keys@4.2.0
    └── is-plain-obj@2.1.0

npm error code ELSPROBLEMS
npm error invalid: @decaf-ts/core@0.8.26 /home/tvenceslau/local-workspace/decaf-ts/for-fabric/node_modules/@decaf-ts/core
npm error invalid: @decaf-ts/decoration@0.8.7 /home/tvenceslau/local-workspace/decaf-ts/for-fabric/node_modules/@decaf-ts/decoration
npm error invalid: @decaf-ts/decorator-validation@1.11.16 /home/tvenceslau/local-workspace/decaf-ts/for-fabric/node_modules/@decaf-ts/decorator-validation
npm error invalid: @decaf-ts/for-couchdb@0.4.32 /home/tvenceslau/local-workspace/decaf-ts/for-fabric/node_modules/@decaf-ts/for-couchdb
npm error invalid: pkcs11js@2.1.6 /home/tvenceslau/local-workspace/decaf-ts/for-fabric/node_modules/pkcs11js
npm error invalid: winston@2.4.7 /home/tvenceslau/local-workspace/decaf-ts/for-fabric/node_modules/winston
npm error A complete log of this run can be found in: /home/tvenceslau/.npm/_logs/2026-01-25T03_00_14_452Z-debug-0.log
```
## Audit report
```sh
npm warn config production Use `--omit=dev` instead.
# npm audit report

elliptic  *
Elliptic Uses a Cryptographic Primitive with a Risky Implementation - https://github.com/advisories/GHSA-848j-6mx2-7j84
fix available via `npm audit fix --force`
Will install fabric-common@1.4.20, which is a breaking change
node_modules/elliptic
  fabric-common  >=1.4.21-snapshot.1
  Depends on vulnerable versions of elliptic
  node_modules/fabric-common
    fabric-ca-client  >=1.4.21-snapshot.1
    Depends on vulnerable versions of fabric-common
    node_modules/fabric-ca-client
    fabric-network  >=1.4.21-snapshot.1
    Depends on vulnerable versions of fabric-common
    node_modules/fabric-network

4 low severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```
