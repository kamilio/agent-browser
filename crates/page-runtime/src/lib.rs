//! The Rust browser's initial QuickJS page-script runtime.
//!
//! Each page owns an engine and job queue. This executes classic scripts and a
//! microtask checkpoint, without installing filesystem, network or browser APIs.
//! Engine memory limits do not account for future Rust-owned DOM/media objects.

use rquickjs::{CatchResultExt, Context, Runtime, context::EvalOptions};
use std::{
    cell::Cell,
    fmt,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

/// Explicit embedding limits; these are not SafeJS steps or data units.
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub memory_bytes: usize,
    pub stack_bytes: usize,
    pub source_bytes: usize,
}

/// Cancellation is permanent for a page and may be requested from another thread.
#[derive(Clone, Default)]
pub struct Cancellation(Arc<AtomicBool>);

impl Cancellation {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }

    fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum RuntimeError {
    InvalidLimits,
    SourceTooLarge,
    Closed,
    Cancelled,
    TimedOut,
    Engine(String),
    JavaScript(String),
}

impl fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLimits => f.write_str("Runtime limits must be nonzero"),
            Self::SourceTooLarge => f.write_str("Script exceeds the source byte limit"),
            Self::Closed => f.write_str("Page runtime is closed"),
            Self::Cancelled => f.write_str("Page execution was cancelled"),
            Self::TimedOut => f.write_str("Page execution exceeded its deadline"),
            Self::Engine(message) | Self::JavaScript(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for RuntimeError {}

struct Engine {
    // Release the context before its owning runtime.
    context: Context,
    runtime: Runtime,
}

/// A single-thread-owned page. Only its cancellation handle crosses threads.
pub struct PageRuntime {
    engine: Option<Engine>,
    limits: Limits,
    cancellation: Cancellation,
    deadline: Rc<Cell<Option<Instant>>>,
}

impl PageRuntime {
    pub fn new(limits: Limits) -> Result<Self, RuntimeError> {
        if limits.memory_bytes == 0 || limits.stack_bytes == 0 || limits.source_bytes == 0 {
            return Err(RuntimeError::InvalidLimits);
        }
        let runtime = Runtime::new().map_err(|error| RuntimeError::Engine(error.to_string()))?;
        runtime.set_memory_limit(limits.memory_bytes);
        runtime.set_max_stack_size(limits.stack_bytes);
        let context =
            Context::full(&runtime).map_err(|error| RuntimeError::Engine(error.to_string()))?;
        let cancellation = Cancellation::default();
        let deadline = Rc::new(Cell::new(None::<Instant>));
        let interrupt_cancel = cancellation.clone();
        let interrupt_deadline = deadline.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || {
            interrupt_cancel.is_cancelled()
                || interrupt_deadline
                    .get()
                    .is_some_and(|end| Instant::now() >= end)
        })));
        Ok(Self {
            engine: Some(Engine { context, runtime }),
            limits,
            cancellation,
            deadline,
        })
    }

    pub fn cancellation(&self) -> Cancellation {
        self.cancellation.clone()
    }

    pub fn is_closed(&self) -> bool {
        self.engine.is_none()
    }

    /// Idempotently release page state and all queued jobs.
    pub fn close(&mut self) {
        self.engine.take();
        self.deadline.set(None);
    }

    /// Execute a classic script, discard its return value, and drain Promise jobs.
    ///
    /// Global bindings persist between scripts. Ordinary script exceptions are
    /// reported after the checkpoint. Deadline expiry or cancellation destroys
    /// the page, preventing queued jobs from running in a subsequent evaluation.
    /// Interrupt checks are cooperative, not OS-level process isolation.
    pub fn evaluate(
        &mut self,
        source: &str,
        filename: &str,
        timeout: Duration,
    ) -> Result<(), RuntimeError> {
        if self.is_closed() {
            return Err(RuntimeError::Closed);
        }
        if self.cancellation.is_cancelled() {
            self.close();
            return Err(RuntimeError::Cancelled);
        }
        if source.len() > self.limits.source_bytes {
            return Err(RuntimeError::SourceTooLarge);
        }
        let end = Instant::now()
            .checked_add(timeout)
            .ok_or(RuntimeError::InvalidLimits)?;
        self.deadline.set(Some(end));
        let result = self.execute(source, filename);
        let stopped = self.stop_reason();
        self.deadline.set(None);
        if let Some(error) = stopped {
            self.close();
            return Err(error);
        }
        result
    }

    fn stop_reason(&self) -> Option<RuntimeError> {
        if self.cancellation.is_cancelled() {
            Some(RuntimeError::Cancelled)
        } else if self.deadline.get().is_some_and(|end| Instant::now() >= end) {
            Some(RuntimeError::TimedOut)
        } else {
            None
        }
    }

    fn execute(&self, source: &str, filename: &str) -> Result<(), RuntimeError> {
        if let Some(error) = self.stop_reason() {
            return Err(error);
        }
        let engine = self.engine.as_ref().ok_or(RuntimeError::Closed)?;
        let script_result = engine.context.with(|ctx| {
            let mut options = EvalOptions::default();
            options.strict = false;
            options.filename = Some(filename.to_owned());
            ctx.eval_with_options::<(), _>(source, options)
                .catch(&ctx)
                .map_err(|error| {
                    self.stop_reason()
                        .unwrap_or_else(|| RuntimeError::JavaScript(error.to_string()))
                })
        });
        loop {
            if let Some(error) = self.stop_reason() {
                return Err(error);
            }
            match engine.runtime.execute_pending_job() {
                Ok(false) => return script_result,
                Ok(true) => {}
                Err(error) => {
                    return error.0.with(|ctx| {
                        let caught =
                            rquickjs::CaughtError::from_error(&ctx, rquickjs::Error::Exception);
                        Err(self
                            .stop_reason()
                            .unwrap_or_else(|| RuntimeError::JavaScript(caught.to_string())))
                    });
                }
            }
        }
    }
}
