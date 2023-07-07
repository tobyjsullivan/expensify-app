import * as OnyxCommon from './OnyxCommon';

type WalletAdditionalDetails = OnyxCommon.BaseState & {
    /** Questions returned by Ideology */
    questions?: {
        prompt: string;
        type: string;
        answer: string[];
    };

    /** ExpectID ID number related to those questions */
    idNumber?: string;

    /** Error code to determine additional behavior */
    errorCode?: string;

    /** Which field needs attention? */
    errorFields?: OnyxCommon.FieldErrors;
};

export default WalletAdditionalDetails;
