import { Metadata } from "@decaf-ts/decoration";

export const VERSION = "##VERSION##";
export const PACKAGE_NAME = "##PACKAGE##";

Metadata.registerLibrary(PACKAGE_NAME, VERSION);
