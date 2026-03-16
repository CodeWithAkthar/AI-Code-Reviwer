
# BUG-001 — Refresh Token Accumulation

**Status:** Open  
**Severity:** High  
**File:** src/modules/auth/auth.service.ts  
**Discovered:** Module 1 testing  
**Symptom:** MongoDB shows 2 refresh tokens per user after every 
             POST /refresh call instead of exactly 1.

---

## What Should Happen

User has 1 refresh token in MongoDB at all times (per device).
When POST /refresh is called:
  - Old token is REMOVED  (net: -1)
  - New token is ADDED    (net: +1)
  - Total stays at 1      (net: 0)

---

## What Actually Happens

When POST /refresh is called:
  - Old token is removed  (net: -1)
  - New token is added    (net: +1)
  - Old token reappears   (net: +1) ← the bug
  - Total grows to 2      (net: +1)

After 5 refreshes = 5 tokens in the array.

---

## Root Cause — The Exact Bug

rotateRefreshToken and issueTokenPair both operate on the 
SAME in-memory user object. The problem is in this sequence:

STEP 1: rotateRefreshToken splices the consumed token
─────────────────────────────────────────────────────
  user.refreshTokens = [tokenA, tokenB]
  splice(matchIndex, 1)
  user.refreshTokens = [tokenB]  ← tokenA removed in memory
  markModified('refreshTokens')
  await user.save()               ← MongoDB now has [tokenB] ✅

STEP 2: issueTokenPair is called with the same user object
──────────────────────────────────────────────────────────
  Inside issueTokenPair:

  user.refreshTokens = user.refreshTokens.filter(...)
  ↑
  THIS IS THE BUG.
  
  The filter() call reassigns the array from scratch.
  It loads user.refreshTokens from the in-memory object.
  
  At this point the in-memory object still has the state 
  BEFORE the splice was applied — because JavaScript passes 
  objects by reference and Mongoose's internal tracking of 
  the pre-save state is still the original array.
  
  So the filter sees: [tokenA, tokenB]  ← original state
  Filters expired ones: none are expired
  Result: [tokenA, tokenB]              ← tokenA is back!
  
  Then push() adds the new token:
  Result: [tokenA, tokenB, newToken]
  
  markModified + save()
  MongoDB now has: [tokenA, tokenB, newToken]
                    ↑
                    This should have been deleted. It's back.

---

## Why This Is a Security Risk

tokenA was the consumed refresh token.
It was supposed to be dead after rotation.
But it survived in MongoDB.

This means:
1. An attacker who stole tokenA can STILL use it
2. Reuse detection will not fire because the token 
   is legitimately in the database
3. Rotation is effectively broken — the security 
   guarantee of single-use tokens does not hold

---

## The Fix (when you come back to this)

Option A — Reload user from MongoDB after splice save
─────────────────────────────────────────────────────
In rotateRefreshToken, after saving the splice,
reload the user fresh from MongoDB before calling issueTokenPair.
This gives issueTokenPair a clean in-memory state.

  user.refreshTokens.splice(matchIndex, 1);
  user.markModified('refreshTokens');
  await user.save();
  
  // Reload fresh from DB — this is the fix
  const freshUser = await User.findById(user._id) as IUser;
  const tokenPair = await issueTokenPair(freshUser);
  return { tokenPair, user: freshUser };

Option B — Remove the filter() from issueTokenPair
────────────────────────────────────────────────────
Make issueTokenPair NOT reassign the array from scratch.
Instead just push the new token and let rotateRefreshToken
handle removal separately.

  // Remove this line from issueTokenPair:
  user.refreshTokens = user.refreshTokens.filter(...)  ← DELETE THIS
  
  // Keep only:
  user.refreshTokens.push({ tokenHash, createdAt, expiresAt });
  user.markModified('refreshTokens');
  await user.save();
  
  // Then add a separate cleanup call in rotateRefreshToken
  // after the splice to prune expired tokens manually.

Option A is cleaner and safer. Recommended.

---

## How to Verify the Fix Works

1. Clear refreshTokens: [] for your test user in MongoDB Atlas
2. Login fresh via browser
3. MongoDB should show exactly 1 token
4. Call POST /refresh
5. MongoDB should still show exactly 1 token
6. Repeat step 4-5 five times
7. Count should never exceed 1

If count stays at 1 across all refreshes — bug is fixed.

---

## Affected Functions
- rotateRefreshToken() — line where issueTokenPair is called
- issueTokenPair()     — line where filter() reassigns the array

## Not Affected
- Login flow   ✅
- Logout flow  ✅  
- /me endpoint ✅
- bcrypt hashing ✅
- Token format {userId}.{randomHex} ✅