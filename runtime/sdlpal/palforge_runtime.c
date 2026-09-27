/*
 * PalForge runtime adapter for SDLPAL.
 *
 * This file is compiled with a pinned, unmodified upstream checkout after the
 * patch in runtime/sdlpal/patches has been applied in a temporary build tree.
 * It never writes to the user's mounted PAL directory.
 */

#include "main.h"
#include "palforge_runtime.h"

#if defined(__EMSCRIPTEN__)
# include <emscripten/emscripten.h>
# define PALFORGE_EXPORT EMSCRIPTEN_KEEPALIVE
#else
# define PALFORGE_EXPORT
#endif

typedef struct tagPALFORGE_LAUNCH_TARGET
{
   BOOL enabled;
   WORD scene;
   WORD worldX;
   WORD worldY;
   WORD eventObjectId;
   WORD scriptEntry;
   WORD scriptMode;
   WORD direction;
   BOOL pendingScript;
} PALFORGE_LAUNCH_TARGET;

static PALFORGE_LAUNCH_TARGET g_palforgeTarget;

PALFORGE_EXPORT VOID
PALFORGE_SetLaunchTarget(
   INT scene,
   INT worldX,
   INT worldY,
   INT eventObjectId,
   INT scriptEntry,
   INT scriptMode,
   INT direction
)
{
   memset(&g_palforgeTarget, 0, sizeof(g_palforgeTarget));
   g_palforgeTarget.enabled = scene > 0 && scene <= MAX_SCENES;
   g_palforgeTarget.scene = (WORD)scene;
   g_palforgeTarget.worldX = (WORD)(worldX < 0 ? 0 : worldX);
   g_palforgeTarget.worldY = (WORD)(worldY < 0 ? 0 : worldY);
   g_palforgeTarget.eventObjectId = (WORD)(eventObjectId < 0 ? 0 : eventObjectId);
   g_palforgeTarget.scriptEntry = (WORD)(scriptEntry < 0 ? 0 : scriptEntry);
   g_palforgeTarget.scriptMode = (WORD)(scriptMode < 0 ? 0 : scriptMode);
   g_palforgeTarget.direction = (WORD)(direction & 3);
   g_palforgeTarget.pendingScript = g_palforgeTarget.scriptEntry != 0;
}

BOOL
PALFORGE_HasLaunchTarget(
   VOID
)
{
   return g_palforgeTarget.enabled;
}

VOID
PALFORGE_ApplyLaunchTarget(
   VOID
)
{
   INT i;
   INT x;
   INT y;
   INT xOffset;
   INT yOffset;

   if (!g_palforgeTarget.enabled)
   {
      return;
   }

   gpGlobals->wNumScene = g_palforgeTarget.scene;
   gpGlobals->wPartyDirection = g_palforgeTarget.direction;
   gpGlobals->wLayer = 0;
   gpGlobals->partyoffset = PAL_XY(160, 112);
   gpGlobals->viewport = PAL_XY(
      (INT)g_palforgeTarget.worldX - 160,
      (INT)g_palforgeTarget.worldY - 112
   );

   xOffset = ((gpGlobals->wPartyDirection == kDirWest ||
      gpGlobals->wPartyDirection == kDirSouth) ? 16 : -16);
   yOffset = ((gpGlobals->wPartyDirection == kDirWest ||
      gpGlobals->wPartyDirection == kDirNorth) ? 8 : -8);
   x = PAL_X(gpGlobals->partyoffset);
   y = PAL_Y(gpGlobals->partyoffset);

   for (i = 0; i < MAX_PLAYABLE_PLAYER_ROLES; i++)
   {
      gpGlobals->rgParty[i].x = x;
      gpGlobals->rgParty[i].y = y;
      gpGlobals->rgTrail[i].x = x + PAL_X(gpGlobals->viewport);
      gpGlobals->rgTrail[i].y = y + PAL_Y(gpGlobals->viewport);
      gpGlobals->rgTrail[i].wDirection = gpGlobals->wPartyDirection;
      x += xOffset;
      y += yOffset;
   }

   PAL_SetLoadFlags(kLoadScene | kLoadPlayerSprite);
   gpGlobals->fEnteringScene = TRUE;
   gpGlobals->fNeedToFadeIn = TRUE;
}

VOID
PALFORGE_RunPendingScript(
   VOID
)
{
   WORD eventObjectId;
   WORD firstEvent;
   WORD lastEvent;

   if (!g_palforgeTarget.enabled || !g_palforgeTarget.pendingScript ||
      gpGlobals->wNumScene != g_palforgeTarget.scene)
   {
      return;
   }

   g_palforgeTarget.pendingScript = FALSE;
   eventObjectId = g_palforgeTarget.eventObjectId;
   firstEvent = gpGlobals->g.rgScene[gpGlobals->wNumScene - 1].wEventObjectIndex + 1;
   lastEvent = gpGlobals->g.rgScene[gpGlobals->wNumScene].wEventObjectIndex;
   if (eventObjectId < firstEvent || eventObjectId > lastEvent)
   {
      eventObjectId = 0xFFFF;
   }

   if (g_palforgeTarget.scriptMode == 2)
   {
      PAL_RunAutoScript(g_palforgeTarget.scriptEntry, eventObjectId);
   }
   else
   {
      PAL_RunTriggerScript(g_palforgeTarget.scriptEntry, eventObjectId);
   }
}
