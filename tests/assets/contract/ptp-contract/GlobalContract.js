(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@decaf-ts/for-fabric'), require('@decaf-ts/decorator-validation'), require('fabric-contract-api'), require('@decaf-ts/core'), require('@decaf-ts/for-fabric/contracts'), require('@decaf-ts/db-decorators'), require('@decaf-ts/reflection'), require('@decaf-ts/for-typeorm'), require('@decaf-ts/for-fabric/shared')) :
    typeof define === 'function' && define.amd ? define(['exports', '@decaf-ts/for-fabric', '@decaf-ts/decorator-validation', 'fabric-contract-api', '@decaf-ts/core', '@decaf-ts/for-fabric/contracts', '@decaf-ts/db-decorators', '@decaf-ts/reflection', '@decaf-ts/for-typeorm', '@decaf-ts/for-fabric/shared'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory((global.GlobalContract = global.GlobalContract || {}, global.GlobalContract.js = {}), global.forFabric, global.decoratorValidation, global.fabricContractApi, global.core, global.contracts$1, global.dbDecorators, global.reflection, global.forTypeorm, global.shared));
})(this, (function (exports, forFabric, decoratorValidation, fabricContractApi, core, contracts$1, dbDecorators, reflection, forTypeorm, shared) { 'use strict';

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise, SuppressedError, Symbol, Iterator */


    function __decorate(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __metadata(metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    }

    typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    const GTIN_VALIDATION_KEY = "gtin";
    const GTIN_VALIDATION_ERROR_MESSAGE = "Not a valid Gtin";
    // https://www.gs1.org/services/how-calculate-check-digit-manually
    function calculateGtinCheckSum(digits) {
        digits = "" + digits;
        if (digits.length !== 13)
            throw new Error("needs to received 13 digits");
        const multiplier = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
        let sum = 0;
        try {
            // multiply each digit for its multiplier according to the table
            for (let i = 0; i < 13; i++)
                sum += parseInt(digits.charAt(i)) * multiplier[i];
            // Find the nearest equal or higher multiple of ten
            const remainder = sum % 10;
            let nearest;
            if (remainder === 0)
                nearest = sum;
            else
                nearest = sum - remainder + 10;
            return nearest - sum + "";
        }
        catch (e) {
            throw new Error(`Did this received numbers? ${e}`);
        }
    }
    let GtinValidator = class GtinValidator extends decoratorValidation.Validator {
        constructor(message = GTIN_VALIDATION_ERROR_MESSAGE) {
            super(message, "string", "number");
        }
        hasErrors(value, options) {
            if (value === undefined)
                return;
            const { message } = options || {};
            const gtin = value + "";
            if (!gtin.match(/\d{14}/g))
                return this.getMessage(message || this.message);
            const digits = gtin.slice(0, 13);
            const checksum = calculateGtinCheckSum(digits);
            return parseInt(checksum) === parseInt(gtin.charAt(13))
                ? undefined
                : this.getMessage(message || this.message);
        }
    };
    GtinValidator = __decorate([
        decoratorValidation.validator(GTIN_VALIDATION_KEY),
        __metadata("design:paramtypes", [String])
    ], GtinValidator);
    const gtin = (message = GTIN_VALIDATION_ERROR_MESSAGE) => {
        return reflection.apply(decoratorValidation.required(), dbDecorators.readonly(), decoratorValidation.propMetadata(decoratorValidation.Validation.key(GTIN_VALIDATION_KEY), {
            message: message,
            types: ["string", "number"],
            async: false,
        }));
    };

    /**
     * @description Provides utilities for handling and validating locale and language information.
     * @summary
     * The `LocaleHelper` class offers static methods to retrieve supported language data,
     * validate market codes, and construct regex patterns for language and market validation.
     * It includes predefined language mappings and ISO-based market patterns.
     *
     * @param {Map<string, Language>} languages A map of supported language codes and their metadata.
     * @param {RegExp} marketPattern A regular expression used to validate market (country) codes.
     *
     * @class
     * @example
     * ```typescript
     * // Retrieve all supported languages
     * const allLanguages = LocaleHelper.all();
     *
     * // Validate if a code represents a valid language
     * const isValidLang = LocaleHelper.isValidLanguage("en");
     *
     * // Get the native name of a given language code
     * const nativeName = LocaleHelper.getNativeName("es");
     *
     * // Validate a market code
     * const isValidMarket = LocaleHelper.isValidMarket("US");
     * ```
     *
     * @mermaid
     * sequenceDiagram
     *     participant Client
     *     participant LocaleHelper
     *     participant LanguagesMap
     *
     *     Client->>LocaleHelper: call all()
     *     LocaleHelper->>LanguagesMap: retrieve entries
     *     LanguagesMap-->>LocaleHelper: returns language data
     *     LocaleHelper-->>Client: returns Array<Language>
     *
     *     Client->>LocaleHelper: call isValidLanguage("en")
     *     LocaleHelper->>LanguagesMap: check for key "en"
     *     LanguagesMap-->>LocaleHelper: true
     *     LocaleHelper-->>Client: true
     */
    class LocaleHelper {
        static { this.languages = new Map([
            ["ar", { code: "ar", name: "Arabic", nativeName: "العربية" }],
            ["bg", { code: "bg", name: "Bulgarian", nativeName: "Български език" }],
            [
                "zh",
                {
                    code: "zh",
                    name: "Chinese",
                    nativeName: "中文 (Zhōngwén), 汉语, 漢語",
                },
            ],
            ["hr", { code: "hr", name: "Croatian", nativeName: "hrvatski" }],
            ["cs", { code: "cs", name: "Czech", nativeName: "Česky, čeština" }],
            ["da", { code: "da", name: "Danish", nativeName: "Dansk" }],
            ["nl", { code: "nl", name: "Dutch", nativeName: "Nederlands, Vlaams" }],
            ["en", { code: "en", name: "English", nativeName: "English" }],
            ["en-gb", { code: "en-gb", name: "English (UK)", nativeName: "English" }],
            ["et", { code: "et", name: "Estonian", nativeName: "Eesti, eesti keel" }],
            ["fi", { code: "fi", name: "Finnish", nativeName: "Suomi, suomen kieli" }],
            ["fr", { code: "fr", name: "French", nativeName: "Français" }],
            ["ka", { code: "ka", name: "Georgian", nativeName: "ქართული" }],
            ["de", { code: "de", name: "German", nativeName: "Deutsch" }],
            ["el", { code: "el", name: "Greek, Modern", nativeName: "Ελληνικά" }],
            ["he", { code: "he", name: "Hebrew (modern)", nativeName: "עברית" }],
            ["hi", { code: "hi", name: "Hindi", nativeName: "हिन्दी, हिंदी" }],
            ["hu", { code: "hu", name: "Hungarian", nativeName: "Magyar" }],
            ["id", { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" }],
            ["is", { code: "is", name: "Icelandic", nativeName: "Islenska" }],
            ["it", { code: "it", name: "Italian", nativeName: "Italiano" }],
            [
                "ja",
                {
                    code: "ja",
                    name: "Japanese",
                    nativeName: "日本語 (にほんご／にっぽんご)",
                },
            ],
            [
                "ko",
                {
                    code: "ko",
                    name: "Korean",
                    nativeName: "한국어 (韓國語), 조선말 (朝鮮語)",
                },
            ],
            ["lt", { code: "lt", name: "Lithuanian", nativeName: "Lietuvių kalba" }],
            ["lv", { code: "lv", name: "Latvian", nativeName: "Latviešu valoda" }],
            ["mk", { code: "mk", name: "Macedonian", nativeName: "Македонски јазик" }],
            ["no", { code: "no", name: "Norwegian", nativeName: "Norsk" }],
            [
                "pa",
                { code: "pa", name: "Panjabi, Punjabi", nativeName: "ਪੰਜਾਬੀ, پنجابی‎" },
            ],
            ["pl", { code: "pl", name: "Polish", nativeName: "Polski" }],
            ["pt", { code: "pt", name: "Portuguese", nativeName: "Português" }],
            [
                "pt-br",
                {
                    code: "pt-br",
                    name: "Portuguese (Brasil)",
                    nativeName: "Português (Brasil)",
                },
            ],
            ["ro", { code: "ro", name: "Romanian", nativeName: "Română" }],
            ["ru", { code: "ru", name: "Russian", nativeName: "Русский язык" }],
            ["sr", { code: "sr", name: "Serbian", nativeName: "Српски језик" }],
            ["sk", { code: "sk", name: "Slovak", nativeName: "Slovenčina" }],
            ["sl", { code: "sl", name: "Slovenian", nativeName: "Slovenščina" }],
            ["es", { code: "es", name: "Spanish", nativeName: "Español" }],
            [
                "es-419",
                {
                    code: "es-419",
                    name: "Spanish (Latin-American)",
                    nativeName: "Español (latinoamericano)",
                },
            ],
            ["sv", { code: "sv", name: "Swedish", nativeName: "Svenska" }],
            ["th", { code: "th", name: "Thai", nativeName: "ไทย" }],
            ["tr", { code: "tr", name: "Turkish", nativeName: "Türkçe" }],
            ["uk", { code: "uk", name: "Ukrainian", nativeName: "Українська" }],
            ["vi", { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" }],
        ]); }
        static { this.marketPattern = /^(AF|AX|AL|DZ|AS|AD|AO|AI|AQ|AG|AR|AM|AW|AU|AT|AZ|BS|BH|BD|BB|BY|BE|BZ|BJ|BM|BT|BO|BA|BW|BV|BR|IO|BN|BG|BF|BI|KH|CM|CA|CV|KY|CF|TD|CL|CN|CX|CC|CO|KM|CG|CD|CK|CR|CI|HR|CU|CY|CZ|DK|DJ|DM|DO|EC|EG|SV|GQ|ER|EE|ET|FK|FO|FJ|FI|FR|GF|PF|TF|GA|GM|GE|DE|GH|GI|GR|GL|GD|GP|GU|GT|GG|GN|GW|GY|HT|HM|VA|HN|HK|HU|IS|IN|ID|IR|IQ|IE|IM|IL|IT|JM|JP|JE|JO|KZ|KE|KI|KP|KR|KW|KG|LA|LV|LB|LS|LR|LY|LI|LT|LU|MO|MK|MG|MW|MY|MV|ML|MT|MH|MQ|MR|MU|YT|MX|FM|MD|MC|MN|MS|MA|MZ|MM|NA|NR|NP|NL|AN|NC|NZ|NI|NE|NG|NU|NF|MP|NO|OM|PK|PW|PS|PA|PG|PY|PE|PH|PN|PL|PT|PR|QA|RE|RO|RU|RW|SH|KN|LC|PM|VC|WS|SM|ST|SA|SN|CS|SC|SL|SG|SK|SI|SB|SO|ZA|GS|ES|LK|SD|SR|SJ|SZ|SE|CH|SY|TW|TJ|TZ|TH|TL|TG|TK|TO|TT|TN|TR|TM|TC|TV|UG|UA|AE|GB|US|UM|UY|UZ|VU|VE|VN|VG|VI|WF|EH|YE|ZM|ZW)$/; }
        /**
         * @description Retrieves all supported languages.
         * @summary
         * Returns an array containing every language object available within the
         * predefined language map, including their code, English name, and native name.
         *
         * @template T
         * @return {Array<Language>} A list of all available languages.
         */
        static all() {
            return Array.from(this.languages.entries()).map(([code, { name, nativeName }]) => ({
                code,
                name,
                nativeName,
            }));
        }
        /**
         * @description Returns all supported language codes.
         * @summary
         * Extracts and returns an array of all language codes stored within the internal map,
         * allowing consumers to quickly enumerate supported locales.
         *
         * @return {string[]} An array of supported language codes.
         */
        static getLanguageCodes() {
            return [...this.languages.keys()];
        }
        /**
         * @description Builds a regular expression that matches supported language codes.
         * @summary
         * Constructs and returns a `RegExp` instance that matches any of the
         * available language codes stored in the class’s language map.
         *
         * @return {RegExp} A regular expression representing all valid language codes.
         */
        static getLanguagesRegex() {
            const langCodes = this.getLanguageCodes();
            let regexString = "^(";
            langCodes.forEach((code) => {
                regexString = regexString + code + "|";
            });
            regexString.slice(0, -1);
            regexString = regexString + ")$";
            return new RegExp(regexString);
        }
        /**
         * @description Retrieves the English name of a language by its code.
         * @summary
         * Given a language code, this method returns the associated language name in English.
         * If the code is not found, `undefined` is returned.
         *
         * @param {string} code The language code (e.g., `"en"`, `"es"`, `"pt-br"`).
         * @return {string | undefined} The English name of the language, or `undefined` if not found.
         */
        static getName(code) {
            return this.languages.get(code)?.name;
        }
        /**
         * @description Retrieves the native name of a language by its code.
         * @summary
         * Given a language code, this method returns the language’s native name
         * (how it is written in its own script or phonetics).
         *
         * @param {string} code The language code (e.g., `"en"`, `"ja"`, `"zh"`).
         * @return {string | undefined} The native name of the language, or `undefined` if not found.
         */
        static getNativeName(code) {
            return this.languages.get(code)?.nativeName;
        }
        /**
         * @description Validates whether a given language code is supported.
         * @summary
         * Checks the internal language map to determine if the specified code exists
         * as a supported language.
         *
         * @param {string} code The language code to verify.
         * @return {boolean} `true` if the code is supported, otherwise `false`.
         */
        static isValidLanguage(code) {
            return this.languages.has(code);
        }
        /**
         * @description Returns the predefined market validation regular expression.
         * @summary
         * Provides the internal market validation pattern used to check
         * if a given country or market code adheres to supported ISO formats.
         *
         * @return {RegExp} The regular expression for validating market codes.
         */
        static getMarketRegex() {
            return new RegExp(this.marketPattern);
        }
        /**
         * @description Validates a market (country) code against the predefined pattern.
         * @summary
         * Checks if the given market code matches the internal ISO-compliant
         * market regex pattern. The comparison is case-insensitive.
         *
         * @param {string} code The market or country code to validate (e.g., `"US"`, `"BR"`, `"DE"`).
         * @return {boolean} `true` if the market code is valid, otherwise `false`.
         */
        static isValidMarket(code) {
            return this.marketPattern.test(code.toUpperCase());
        }
    }

    const DatePattern = "yyyy-MM-dd";
    const BatchPattern = /^[a-zA-Z0-9/-]{1,20}$/;
    const LanguagesPattern = LocaleHelper.getLanguagesRegex();
    const ProductMarketPattern = LocaleHelper.getMarketRegex();
    var TableNames;
    (function (TableNames) {
        TableNames["Audit"] = "audit";
        TableNames["Batch"] = "batch";
        TableNames["GtinOwner"] = "gtin_owner";
        TableNames["Leaflet"] = "leaflet";
        TableNames["LeafletFile"] = "leaflet_file";
        TableNames["Product"] = "product";
        TableNames["ProductMarket"] = "product_market";
        TableNames["ProductStrength"] = "product_strength";
    })(TableNames || (TableNames = {}));
    var AuditOperations;
    (function (AuditOperations) {
        AuditOperations["REMOVE"] = "Remove user";
        AuditOperations["ADD"] = "Add user";
        AuditOperations["DEACTIVATE"] = "Deactivate user";
        AuditOperations["LOGIN"] = "Access wallet";
        AuditOperations["SHARED_ENCLAVE_CREATE"] = "Create identity";
        AuditOperations["BREAK_GLASS_RECOVERY"] = "Wallet recovered with the break Glass Recovery Code";
        AuditOperations["AUTHORIZE"] = "Authorize integration user";
        AuditOperations["REVOKE"] = "Revoke integration user";
        AuditOperations["USER_ACCESS"] = "Access wallet";
        AuditOperations["DATA_RECOVERY"] = "Use of the Data Recovery Key";
        AuditOperations["RECOVERY_KEY_COPIED"] = "Copy Data Recovery Key";
    })(AuditOperations || (AuditOperations = {}));
    var UserGroup;
    (function (UserGroup) {
        UserGroup["ADMIN"] = "admin";
        UserGroup["READ"] = "read";
        UserGroup["WRITE"] = "write";
    })(UserGroup || (UserGroup = {}));
    const DBFlavour = forTypeorm.TypeORMFlavour;

    let GtinOwner = class GtinOwner extends core.BaseModel {
        constructor(model) {
            super(model);
        }
    };
    __decorate([
        decoratorValidation.description("GTIN code identifying the product."),
        core.pk({ type: "String", generated: false }),
        gtin(),
        __metadata("design:type", String)
    ], GtinOwner.prototype, "productCode", void 0);
    __decorate([
        decoratorValidation.description("Entity that owns or is responsible for the GTIN."),
        core.column(),
        decoratorValidation.required(),
        shared.OwnedBy(),
        __metadata("design:type", String)
    ], GtinOwner.prototype, "ownedBy", void 0);
    GtinOwner = __decorate([
        decoratorValidation.description("Defines the ownership information for a specific GTIN."),
        core.uses(shared.FabricFlavour),
        dbDecorators.BlockOperations([dbDecorators.OperationKeys.DELETE]),
        core.table(TableNames.GtinOwner),
        decoratorValidation.model(),
        __metadata("design:paramtypes", [Object])
    ], GtinOwner);

    var GtinOwnerContract_1;
    fabricContractApi.Object()(decoratorValidation.Model);
    fabricContractApi.Object()(core.BaseModel);
    let GtinOwnerContract = GtinOwnerContract_1 = class GtinOwnerContract extends contracts$1.SerializedCrudContract {
        constructor() {
            super(GtinOwnerContract_1.name, GtinOwner);
        }
    };
    GtinOwnerContract = GtinOwnerContract_1 = __decorate([
        fabricContractApi.Info({
            title: "GtinOwnerContract",
            description: "Contract managing the Gtin Owners",
        }),
        __metadata("design:paramtypes", [])
    ], GtinOwnerContract);

    let Audit = class Audit extends core.BaseModel {
        constructor(model) {
            super(model);
        }
    };
    __decorate([
        core.pk(),
        decoratorValidation.description("Unique identifier of the audit record."),
        __metadata("design:type", String)
    ], Audit.prototype, "id", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        dbDecorators.readonly(),
        decoratorValidation.description("Identifier of the user who performed the action."),
        __metadata("design:type", String)
    ], Audit.prototype, "userId", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        dbDecorators.readonly(),
        decoratorValidation.type(String.name),
        decoratorValidation.description("Group or role of the user who performed the action."),
        __metadata("design:type", String)
    ], Audit.prototype, "userGroup", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        dbDecorators.readonly(),
        decoratorValidation.type(String.name),
        decoratorValidation.description("Type of action performed by the user."),
        __metadata("design:type", String)
    ], Audit.prototype, "action", void 0);
    Audit = __decorate([
        decoratorValidation.description("Logs user activity for auditing purposes."),
        core.uses(DBFlavour),
        dbDecorators.BlockOperations([dbDecorators.OperationKeys.UPDATE, dbDecorators.OperationKeys.DELETE]),
        core.table(TableNames.Audit),
        decoratorValidation.model(),
        __metadata("design:paramtypes", [Object])
    ], Audit);

    class ToolkitBaseModel extends decoratorValidation.Model {
        constructor(arg) {
            super(arg);
        }
    }
    __decorate([
        core.column("created_on"),
        core.createdAt(),
        __metadata("design:type", Date)
    ], ToolkitBaseModel.prototype, "createdOn", void 0);
    __decorate([
        core.column("updated_on"),
        core.updatedAt(),
        __metadata("design:type", Date)
    ], ToolkitBaseModel.prototype, "updatedOn", void 0);
    __decorate([
        dbDecorators.version(),
        __metadata("design:type", Number)
    ], ToolkitBaseModel.prototype, "version", void 0);

    let Product = class Product extends ToolkitBaseModel {
        // @oneToMany(() => ProductStrength, {update: Cascade.CASCADE, delete: Cascade.NONE}, false)
        // strengths!: ProductStrength[];
        //
        // @oneToMany(() => ProductMarket, {update: Cascade.CASCADE, delete: Cascade.NONE}, false)
        // markets!: ProductMarket[];
        constructor(args) {
            super(args);
            this.productRecall = false;
        }
    };
    __decorate([
        core.pk({ type: "String", generated: false }),
        gtin(),
        dbDecorators.readonly(),
        __metadata("design:type", String)
    ], Product.prototype, "productCode", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        __metadata("design:type", String)
    ], Product.prototype, "inventedName", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        __metadata("design:type", String)
    ], Product.prototype, "nameMedicinalProduct", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", String)
    ], Product.prototype, "internalMaterialCode", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", Boolean)
    ], Product.prototype, "productRecall", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", Boolean)
    ], Product.prototype, "flagEnableAdverseEventReporting", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", String)
    ], Product.prototype, "adverseEventReportingURL", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", Boolean)
    ], Product.prototype, "flagEnableACFProductCheck", void 0);
    __decorate([
        core.column(),
        decoratorValidation.url(),
        __metadata("design:type", String)
    ], Product.prototype, "acfProductCheckURL", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", String)
    ], Product.prototype, "patientSpecificLeaflet", void 0);
    __decorate([
        core.column(),
        __metadata("design:type", String)
    ], Product.prototype, "healthcarePractitionerInfo", void 0);
    Product = __decorate([
        core.uses(shared.FabricFlavour),
        core.table(TableNames.Product),
        decoratorValidation.model(),
        dbDecorators.BlockOperations([dbDecorators.OperationKeys.DELETE]),
        __metadata("design:paramtypes", [Object])
    ], Product);

    let Batch = class Batch extends ToolkitBaseModel {
        // TODO -> Uncomment and fix
        // @column({ type: "text", array: true })
        // @list(String)
        // @description("List of valid serial numbers for the batch.")
        // snValid?: string[];
        constructor(model) {
            super(model);
            this.batchRecall = false;
            this.flagEnableEXPVerification = false;
            this.flagEnableExpiredEXPCheck = false;
            this.flagEnableBatchRecallMessage = false;
            this.flagEnableACFBatchCheck = false;
            this.flagEnableSNVerification = false;
            this.snValidReset = false;
        }
    };
    __decorate([
        core.pk({ type: "String", generated: false }),
        dbDecorators.composed(["productCode", "batchNumber"], ":", true),
        decoratorValidation.description("Unique identifier composed of product code and batch number."),
        __metadata("design:type", String)
    ], Batch.prototype, "id", void 0);
    __decorate([
        core.manyToOne(() => Product, { update: core.Cascade.NONE, delete: core.Cascade.NONE }, false),
        gtin(),
        dbDecorators.readonly(),
        decoratorValidation.description("Code of the product associated with this batch."),
        __metadata("design:type", String)
    ], Batch.prototype, "productCode", void 0);
    __decorate([
        core.column(),
        dbDecorators.readonly(),
        decoratorValidation.pattern(BatchPattern),
        decoratorValidation.description("Batch number assigned to the product."),
        __metadata("design:type", String)
    ], Batch.prototype, "batchNumber", void 0);
    __decorate([
        decoratorValidation.required(),
        decoratorValidation.date(DatePattern),
        core.column(),
        decoratorValidation.description("Date when the batch expires."),
        __metadata("design:type", Date)
    ], Batch.prototype, "expiryDate", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Import license number for this batch."),
        __metadata("design:type", String)
    ], Batch.prototype, "importLicenseNumber", void 0);
    __decorate([
        core.column(),
        decoratorValidation.date(DatePattern),
        decoratorValidation.description("Date when the batch was manufactured."),
        __metadata("design:type", String)
    ], Batch.prototype, "dateOfManufacturing", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Name of the product manufacturer."),
        __metadata("design:type", String)
    ], Batch.prototype, "manufacturerName", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Manufacturer address line 1."),
        __metadata("design:type", String)
    ], Batch.prototype, "manufacturerAddress1", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Manufacturer address line 2."),
        __metadata("design:type", String)
    ], Batch.prototype, "manufacturerAddress2", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Manufacturer address line 3."),
        __metadata("design:type", String)
    ], Batch.prototype, "manufacturerAddress3", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Manufacturer address line 4."),
        __metadata("design:type", String)
    ], Batch.prototype, "manufacturerAddress4", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Manufacturer address line 5."),
        __metadata("design:type", String)
    ], Batch.prototype, "manufacturerAddress5", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Indicates whether this batch has been recalled."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "batchRecall", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Name of the site where the product was packaged."),
        __metadata("design:type", String)
    ], Batch.prototype, "packagingSiteName", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Version of the electronic product information leaflet."),
        __metadata("design:type", Number)
    ], Batch.prototype, "epiLeafletVersion", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Enables expiry date verification feature."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "flagEnableEXPVerification", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Allows checking for expired batches."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "flagEnableExpiredEXPCheck", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Custom message displayed for this batch."),
        __metadata("design:type", String)
    ], Batch.prototype, "batchMessage", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Enables display of recall messages for this batch."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "flagEnableBatchRecallMessage", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Message shown when the batch is recalled."),
        __metadata("design:type", String)
    ], Batch.prototype, "recallMessage", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Enables ACF batch verification feature."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "flagEnableACFBatchCheck", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("URL for ACF batch verification."),
        __metadata("design:type", String)
    ], Batch.prototype, "acfBatchCheckURL", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Enables serial number (SN) verification feature."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "flagEnableSNVerification", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Identifier of the ACDC authentication feature (SSI)."),
        __metadata("design:type", String)
    ], Batch.prototype, "acdcAuthFeatureSSI", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Indicates if serial number validation was reset."),
        __metadata("design:type", Boolean)
    ], Batch.prototype, "snValidReset", void 0);
    Batch = __decorate([
        decoratorValidation.description("Represents a product batch"),
        core.uses(DBFlavour),
        dbDecorators.BlockOperations([dbDecorators.OperationKeys.DELETE]),
        core.table(TableNames.Batch),
        decoratorValidation.model(),
        __metadata("design:paramtypes", [Object])
    ], Batch);

    let LeafletFile = class LeafletFile extends ToolkitBaseModel {
        constructor(model) {
            super(model);
        }
    };
    __decorate([
        core.pk(),
        decoratorValidation.description("Unique identifier of the leaflet file."),
        __metadata("design:type", String)
    ], LeafletFile.prototype, "id", void 0);
    __decorate([
        core.manyToOne(() => Leaflet, { update: core.Cascade.NONE, delete: core.Cascade.NONE }, false),
        decoratorValidation.description("Identifier of the leaflet this file belongs to."),
        __metadata("design:type", String)
    ], LeafletFile.prototype, "leafletId", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        decoratorValidation.description("Name of the file, including its extension."),
        __metadata("design:type", String)
    ], LeafletFile.prototype, "filename", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        decoratorValidation.description("Base64-encoded content of the file."),
        __metadata("design:type", String)
    ], LeafletFile.prototype, "fileContent", void 0);
    LeafletFile = __decorate([
        decoratorValidation.description("Represents an additional file associated with a leaflet, such as a PDF or image."),
        core.uses(DBFlavour),
        core.table(TableNames.LeafletFile),
        decoratorValidation.model(),
        __metadata("design:paramtypes", [Object])
    ], LeafletFile);

    let Leaflet = class Leaflet extends ToolkitBaseModel {
        constructor(model) {
            super(model);
        }
    };
    __decorate([
        core.pk({ type: "String", generated: false }),
        dbDecorators.composed(["productCode", "batchNumber", "lang"], ":", true),
        decoratorValidation.description("Unique identifier composed of product code, batch number, and language."),
        __metadata("design:type", String)
    ], Leaflet.prototype, "id", void 0);
    __decorate([
        core.manyToOne(() => Product, { update: core.Cascade.CASCADE, delete: core.Cascade.CASCADE }, false),
        gtin(),
        decoratorValidation.required(),
        dbDecorators.readonly(),
        decoratorValidation.description("GTIN code of the product associated with this leaflet."),
        __metadata("design:type", String)
    ], Leaflet.prototype, "productCode", void 0);
    __decorate([
        core.manyToOne(() => Batch, { update: core.Cascade.CASCADE, delete: core.Cascade.CASCADE }, false),
        decoratorValidation.pattern(BatchPattern),
        dbDecorators.readonly(),
        decoratorValidation.description("Batch number linked to the product, if applicable."),
        __metadata("design:type", String)
    ], Leaflet.prototype, "batchNumber", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        decoratorValidation.pattern(LanguagesPattern),
        dbDecorators.readonly(),
        decoratorValidation.description("Language code of the leaflet (e.g., 'en', 'pt', 'es')."),
        __metadata("design:type", String)
    ], Leaflet.prototype, "lang", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        decoratorValidation.description("Main XML content of the electronic leaflet."),
        __metadata("design:type", String)
    ], Leaflet.prototype, "xmlFileContent", void 0);
    __decorate([
        core.oneToMany(() => LeafletFile, { update: core.Cascade.CASCADE, delete: core.Cascade.CASCADE }, false),
        decoratorValidation.description("List of additional files linked to the leaflet, such as PDFs or images."),
        __metadata("design:type", Array)
    ], Leaflet.prototype, "otherFilesContent", void 0);
    Leaflet = __decorate([
        decoratorValidation.description("Represents the ePI leaflet linked to a specific product, batch, and language."),
        core.uses(DBFlavour),
        core.table(TableNames.Leaflet),
        decoratorValidation.model(),
        __metadata("design:paramtypes", [Object])
    ], Leaflet);

    let ProductMarket = class ProductMarket extends ToolkitBaseModel {
        constructor(model) {
            super(model);
        }
    };
    __decorate([
        core.pk({ type: "String", generated: false }),
        dbDecorators.composed(["productCode", "marketId"], ":", true),
        decoratorValidation.description("Unique identifier composed of product code and market ID."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "id", void 0);
    __decorate([
        core.manyToOne(() => Product, { update: core.Cascade.NONE, delete: core.Cascade.NONE }, false),
        decoratorValidation.description("GTIN code of the product associated with this market entry."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "productCode", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        decoratorValidation.pattern(ProductMarketPattern),
        decoratorValidation.description("Identifier of the market where the product is registered or sold."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "marketId", void 0);
    __decorate([
        core.column(),
        decoratorValidation.minlength(2),
        decoratorValidation.maxlength(2),
        decoratorValidation.description("Two-letter national code (ISO format) representing the market's country."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "nationalCode", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Name of the Marketing Authorization Holder (MAH)."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "mahName", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Name of the legal entity responsible for the product in this market."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "legalEntityName", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Address of the Marketing Authorization Holder or responsible legal entity."),
        __metadata("design:type", String)
    ], ProductMarket.prototype, "mahAddress", void 0);
    ProductMarket = __decorate([
        decoratorValidation.description("Links a product to a specific market."),
        core.uses(DBFlavour),
        core.table(TableNames.ProductMarket),
        decoratorValidation.model(),
        __metadata("design:paramtypes", [Object])
    ], ProductMarket);

    let ProductStrength = class ProductStrength extends ToolkitBaseModel {
        constructor(model) {
            super(model);
        }
    };
    __decorate([
        core.pk(),
        decoratorValidation.description("Unique identifier of the product strength."),
        __metadata("design:type", String)
    ], ProductStrength.prototype, "id", void 0);
    __decorate([
        core.manyToOne(() => Product, { update: core.Cascade.NONE, delete: core.Cascade.NONE }, false),
        decoratorValidation.description("Product code associated with this strength entry."),
        __metadata("design:type", String)
    ], ProductStrength.prototype, "productCode", void 0);
    __decorate([
        core.column(),
        decoratorValidation.required(),
        decoratorValidation.description("Product concentration or dosage (e.g., 500mg, 10%)."),
        __metadata("design:type", String)
    ], ProductStrength.prototype, "strength", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Active substance related to this product strength."),
        __metadata("design:type", String)
    ], ProductStrength.prototype, "substance", void 0);
    __decorate([
        core.column(),
        decoratorValidation.description("Legal entity name responsible for the product."),
        __metadata("design:type", String)
    ], ProductStrength.prototype, "legalEntityName", void 0);
    ProductStrength = __decorate([
        core.uses(DBFlavour),
        core.table(TableNames.ProductStrength),
        decoratorValidation.model(),
        decoratorValidation.description("Represents the product’s strength and composition details."),
        __metadata("design:paramtypes", [Object])
    ], ProductStrength);

    var ProductContract_1;
    fabricContractApi.Object()(decoratorValidation.Model);
    fabricContractApi.Object()(core.BaseModel);
    let ProductContract = ProductContract_1 = class ProductContract extends contracts$1.SerializedCrudContract {
        constructor() {
            super(ProductContract_1.name, Product);
        }
    };
    ProductContract = ProductContract_1 = __decorate([
        fabricContractApi.Info({
            title: "ProductContract",
            description: "Contract managing the Products",
        }),
        __metadata("design:paramtypes", [])
    ], ProductContract);

    console.log(forFabric.FabricCrudContract.name);
    const contracts = [GtinOwnerContract, ProductContract];

    exports.contracts = contracts;

}));
