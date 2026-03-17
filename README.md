# B2B PRM Starter — Hello Module (SPEC-062 Validation)

Minimal module for validating the Use-Case Starters Framework (SPEC-062).

## Setup

1. Copy `src/modules/hello/` to your app's `src/modules/`
2. Add entry from `modules.ts.snippet` to `src/modules.ts`
3. Run `yarn generate`
4. Run `yarn initialize` (first time) or `yarn dev`

## What it validates

- Module auto-discovery via `yarn generate`
- Backend page rendering at `/backend/hello`
- ACL feature registration (`hello.view`)
- Setup hook execution (`defaultRoleFeatures`)
