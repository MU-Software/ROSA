import argparse

import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--debug", action="store_true", default=False)

    args = parser.parse_args()
    uvicorn.run(
        app="src:create_app",
        factory=True,
        reload=args.debug,
        host=args.host,
        port=args.port,
        workers=args.workers,
    )
