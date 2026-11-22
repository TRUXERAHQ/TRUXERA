import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "./operations-page-data";
import TruckShell, { type ActiveSection } from "./trucks/truck-shell";
import { Notice, PageHeader, Panel } from "./ui";

type Props = {
  searchParams: Promise<OperationsSearchParams>;
  section: ActiveSection;
  eyebrow: string;
  title: string;
  description: string;
};

export async function AuxShell({
  searchParams,
  section,
  eyebrow,
  title,
  description,
}: Props) {
  const context = await getOperationsPageContext(await searchParams);

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection={section}
    >
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
        />
        <div className="mt-6">
          <Panel title="Coming soon">
            <Notice>
              This area is part of the TRUXERA navigation structure but is not
              available yet. It will be enabled in an upcoming release.
            </Notice>
          </Panel>
        </div>
      </div>
    </TruckShell>
  );
}
