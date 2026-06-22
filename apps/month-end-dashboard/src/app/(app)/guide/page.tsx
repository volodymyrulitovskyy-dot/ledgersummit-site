import Image from 'next/image'
import { requireScreen } from '@/lib/auth/guard'
import { guidePrinciples, guideSteps } from '@/lib/content/appGuide'

export default async function GuidePage() {
  await requireScreen('guide')

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section className="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-4">
              <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                Guide
              </span>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                How the application works from setup through signoff
              </h1>
              <p className="text-base leading-7 text-slate-600">
                Use this page as the operating playbook for the close. It explains the sequence of work, what each area of the app is responsible for, and how the process stays auditable.
              </p>
              <div className="space-y-3">
                {guidePrinciples.map((principle) => (
                  <div
                    key={principle}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    {principle}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <Image
                src="/app-workflow-diagram.svg"
                alt="Workflow diagram showing the close process from data import to final signoff."
                width={1100}
                height={780}
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {guideSteps.map((step) => (
            <article
              key={step.step}
              className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                Step {step.step}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{step.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{step.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm lg:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Where to work inside the app</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
              <div className="text-sm font-semibold">Home / Close</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Review the active period, monitor open exceptions, and keep the close moving.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
              <div className="text-sm font-semibold">Rules and Variance</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Inspect automated checks, thresholds, and period-over-period movements.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
              <div className="text-sm font-semibold">Schedules and Reconciliations</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Tie detail to balances and maintain the roll-forwards that support month-end review.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
              <div className="text-sm font-semibold">Checklist and Calendar</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Track owners, due dates, and completion so review is finished before signoff.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
