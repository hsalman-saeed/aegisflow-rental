"use client";

import { useMemo, useRef } from "react";
import {
  AgStudio,
  createWidgets,
  type AgRegistry,
  type AgWidgetDefinition,
} from "ag-studio-react";
import {
  createAiHarness,
  directLlmRunner,
  studioTheme,
  type AgDefaultRegistry,
  type AgStudioApi,
  type AgStudioMode,
} from "ag-studio";
import {
  createBedrockNovaAgAdapter,
  createReadinessAiTool,
} from "@/lib/ag-studio/bedrock-nova-adapter";
import { buildStudioDataSources } from "@/lib/ag-studio/data-sources";
import { DepositHealthStudioComp } from "@/components/studio/DepositHealthWidget";
import type { SessionData } from "@/types/domain";

interface DepositHealthRegistry extends AgRegistry {
  formats: AgDefaultRegistry["formats"];
  buckets: AgDefaultRegistry["buckets"];
  widgets: readonly [AgWidgetDefinition<"deposit-health-widget">];
}

interface AgStudioInnerProps {
  session: SessionData;
  mode: AgStudioMode;
}

const darkCinemaStudioTheme = studioTheme.withParams({
  accentColor: "#2563EB",
  backgroundColor: "#090D16",
  borderColor: "#1F2937",
  browserColorScheme: "dark",
  textColor: "#F9FAFB",
  studioCanvasBackgroundColor: "#090D16",
  studioPanelContainerBackgroundColor: "#111827",
  studioWrapperBackgroundColor: "#090D16",
});

export default function AgStudioInner({ session, mode }: AgStudioInnerProps) {
  const sessionRef = useRef<SessionData>(session);
  sessionRef.current = session;

  const dataSources = useMemo(
    () => buildStudioDataSources(session),
    [session]
  );

  const widgets = useMemo(
    () =>
      createWidgets<DepositHealthRegistry>({
        additionalTypes: [
          {
            id: "deposit-health-widget",
            label: "Deposit Health KPIs",
            comp: DepositHealthStudioComp,
            defaultSize: { width: 12, height: 6 },
            minSize: { width: 6, height: 4 },
            form: ({ createDefaults }) => createDefaults({}),
          },
        ],
      }),
    []
  );

  return (
    <div className="h-[640px] w-full overflow-hidden rounded-xl border border-gray-800 bg-[#090D16]">
      <AgStudio
        studioId="aegisflow-studio"
        theme={darkCinemaStudioTheme}
        mode={mode}
        data={dataSources}
        context={{ session }}
        widgets={widgets as never}
        style={{ height: "100%", width: "100%" }}
        ai={({ api }) => {
          const adapter = createBedrockNovaAgAdapter();
          const readinessTool = createReadinessAiTool(() => sessionRef.current);
          return createAiHarness(api as unknown as AgStudioApi, ({ builtIn }) => ({
            primary: "lead",
            agents: [
              directLlmRunner({
                ...builtIn.lead,
                adapter,
                tools: (ctx, p) => [
                  ...(builtIn.lead.tools?.(ctx, p) ?? []),
                  readinessTool,
                ],
              }),
              directLlmRunner({ ...builtIn.data, adapter }),
              directLlmRunner({ ...builtIn.page, adapter }),
              directLlmRunner({ ...builtIn.widget, adapter }),
              directLlmRunner({ ...builtIn.planning, adapter }),
            ],
            promptStarters: [
              {
                label: "Audit BK-9021 Dispute Readiness",
                prompt:
                  "Run check_dispute_evidence_readiness on Booking BK-9021 and summarize all 4 pillars.",
              },
              {
                label: "Explain Recovery & Win Rates",
                prompt:
                  "Explain our Deposit Recovery Rate (% of Priced) and Dispute Win Rate from the 6 relational tables.",
              },
              {
                label: "Audit Braintree & Channel3 Proofs",
                prompt:
                  "Summarize all Braintree transactions and Channel3 retail price proofs in the session.",
              },
            ],
          }));
        }}
      />
    </div>
  );
}

