/**
 * Fund classification policy (update §16). Each classification declares whether
 * fiat backing is required and the minimum backing ratio in basis points.
 *
 * Two rules from the spec are encoded here:
 *  - Do NOT automatically require reserve for all loyalty points.
 *  - Do NOT automatically treat value-bearing rewards as unregulated points.
 */
import { FundClassification } from './enums';
export interface FundBackingPolicy {
    readonly classification: FundClassification;
    readonly fiatBackingRequired: boolean;
    /** Minimum backing ratio in basis points (10000 = 100%). 0 if not required. */
    readonly requiredBackingBps: number;
    readonly redeemable: boolean;
    readonly transferable: boolean;
    /** Whether mint/issuance requires trustee authorization. */
    readonly authorizationRequired: boolean;
}
export declare function backingPolicyFor(classification: FundClassification): FundBackingPolicy;
/** Whether issuing this classification requires verified fiat backing first. */
export declare function requiresFiatBacking(classification: FundClassification): boolean;
//# sourceMappingURL=fund-classification.d.ts.map