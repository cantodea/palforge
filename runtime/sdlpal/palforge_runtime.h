#ifndef PALFORGE_RUNTIME_H
#define PALFORGE_RUNTIME_H

#include "common.h"

PAL_C_LINKAGE_BEGIN

VOID
PALFORGE_SetLaunchTarget(
   INT scene,
   INT worldX,
   INT worldY,
   INT eventObjectId,
   INT scriptEntry,
   INT scriptMode,
   INT direction
);

BOOL
PALFORGE_HasLaunchTarget(
   VOID
);

VOID
PALFORGE_ApplyLaunchTarget(
   VOID
);

VOID
PALFORGE_RunPendingScript(
   VOID
);

PAL_C_LINKAGE_END

#endif
