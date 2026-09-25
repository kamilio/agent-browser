use agent_browser_page_runtime::{Limits, PageRuntime, RuntimeError};
use std::{thread, time::Duration};

fn page() -> PageRuntime {
    PageRuntime::new(Limits {
        memory_bytes: 8 * 1024 * 1024,
        stack_bytes: 256 * 1024,
        source_bytes: 1024 * 1024,
    })
    .unwrap()
}

fn run(page: &mut PageRuntime, source: &str) -> Result<(), RuntimeError> {
    page.evaluate(source, "fixture.js", Duration::from_secs(2))
}

#[test]
fn classic_globals_persist_and_pages_are_isolated() {
    let mut first = page();
    let mut second = page();
    run(
        &mut first,
        "var shared = 40; let lexical = 2; implicit = 7;",
    )
    .unwrap();
    run(
        &mut first,
        "if (shared + lexical !== 42 || globalThis.implicit !== 7) throw Error('globals');",
    )
    .unwrap();
    run(
        &mut second,
        "if (typeof shared !== 'undefined' || typeof lexical !== 'undefined') throw Error('leak');",
    )
    .unwrap();
}

#[test]
fn runs_javascript_cases_previously_reported_to_safejs() {
    run(
        &mut page(),
        r#"
        const from = new Set;
        from.add(42);
        const absent = null;
        if (absent?.b.c !== undefined || !from.has(42)) throw Error('syntax');
        if (/needle/i.exec('İ before NEEDLE').index !== 9) throw Error('offset');
        new Promise(resolve => resolve(42)).then(value => globalThis.answer = value);
    "#,
    )
    .unwrap();
}

#[test]
fn completes_nested_promise_jobs_before_returning() {
    let mut page = page();
    run(&mut page, "globalThis.order = []; Promise.resolve().then(() => { order.push(1); Promise.resolve().then(() => order.push(3)); }); Promise.resolve().then(() => order.push(2));").unwrap();
    run(
        &mut page,
        "if (order.join(',') !== '1,2,3') throw Error('job order');",
    )
    .unwrap();
}

#[test]
fn exceptions_report_filename_and_still_perform_a_checkpoint() {
    let mut page = page();
    let error = run(
        &mut page,
        "Promise.resolve().then(() => globalThis.ran = true); throw Error('expected');",
    )
    .unwrap_err();
    assert!(
        matches!(error, RuntimeError::JavaScript(ref detail) if detail.contains("expected") && detail.contains("fixture.js"))
    );
    run(&mut page, "if (ran !== true) throw Error('checkpoint');").unwrap();
}

#[test]
fn bare_engine_does_not_install_host_capabilities() {
    run(&mut page(), "for (const name of ['process', 'require', 'std', 'os', 'fetch', 'WebSocket', 'document', 'WebAssembly']) { if (typeof globalThis[name] !== 'undefined') throw Error(name); }").unwrap();
}

#[test]
fn engine_heap_limit_rejects_large_allocations() {
    let mut page = page();
    assert!(matches!(
        run(
            &mut page,
            "globalThis.large = new Array(10000000).fill(42);"
        ),
        Err(RuntimeError::JavaScript(_))
    ));
    page.close();
}

#[test]
fn recursion_hits_the_engine_stack_bound_without_losing_the_page() {
    let mut page = page();
    assert!(matches!(
        run(&mut page, "function recurse() { return recurse() + 1; } recurse();"),
        Err(RuntimeError::JavaScript(ref detail)) if detail.contains("stack")
    ));
    run(&mut page, "1 + 1").unwrap();
}

#[test]
fn exception_formatting_remains_under_the_execution_deadline() {
    let mut page = page();
    assert_eq!(
        page.evaluate(
            "const error = new Error(); Object.defineProperty(error, 'message', { get() { while (true) {} } }); throw error;",
            "exception.js",
            Duration::from_millis(20),
        ),
        Err(RuntimeError::TimedOut)
    );
    assert!(page.is_closed());
}

#[test]
fn synchronous_loop_expires_and_revokes_page() {
    let mut page = page();
    assert_eq!(
        page.evaluate("while (true) {}", "loop.js", Duration::from_millis(20)),
        Err(RuntimeError::TimedOut)
    );
    assert!(page.is_closed());
    assert_eq!(run(&mut page, "1"), Err(RuntimeError::Closed));
}

#[test]
fn self_replenishing_microtasks_share_the_deadline() {
    let mut page = page();
    assert_eq!(
        page.evaluate(
            "function again() { Promise.resolve().then(again); } again();",
            "jobs.js",
            Duration::from_millis(20)
        ),
        Err(RuntimeError::TimedOut)
    );
    assert!(page.is_closed());
}

#[test]
fn another_thread_can_cancel_running_code() {
    let mut page = page();
    let cancellation = page.cancellation();
    let worker = thread::spawn(move || {
        thread::sleep(Duration::from_millis(20));
        cancellation.cancel();
    });
    let result = run(&mut page, "while (true) {}");
    worker.join().unwrap();
    assert_eq!(result, Err(RuntimeError::Cancelled));
    assert!(page.is_closed());
}

#[test]
fn cancellation_before_execution_and_explicit_close_are_final() {
    let mut page = page();
    page.cancellation().cancel();
    assert_eq!(run(&mut page, "1"), Err(RuntimeError::Cancelled));
    page.close();
    page.close();
    assert_eq!(run(&mut page, "1"), Err(RuntimeError::Closed));
}

#[test]
fn zero_deadline_does_not_execute_a_script() {
    let mut page = page();
    assert_eq!(
        page.evaluate("1", "zero.js", Duration::ZERO),
        Err(RuntimeError::TimedOut)
    );
    assert!(page.is_closed());
}

#[test]
fn source_limit_rejects_before_parsing_without_closing_page() {
    let mut page = PageRuntime::new(Limits {
        memory_bytes: 8 * 1024 * 1024,
        stack_bytes: 256 * 1024,
        source_bytes: 4,
    })
    .unwrap();
    assert_eq!(run(&mut page, "throw"), Err(RuntimeError::SourceTooLarge));
    run(&mut page, "1+1").unwrap();
}

#[test]
fn zero_limits_cannot_disable_engine_bounds() {
    for limits in [
        Limits {
            memory_bytes: 0,
            stack_bytes: 1,
            source_bytes: 1,
        },
        Limits {
            memory_bytes: 1,
            stack_bytes: 0,
            source_bytes: 1,
        },
        Limits {
            memory_bytes: 1,
            stack_bytes: 1,
            source_bytes: 0,
        },
    ] {
        assert!(matches!(
            PageRuntime::new(limits),
            Err(RuntimeError::InvalidLimits)
        ));
    }
}
