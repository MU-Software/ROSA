import pathlib
import typing

import src.utils.stdlibs.import_utils as import_utils
import typer

typer_app = typer.Typer()

current_dir = pathlib.Path(__file__).parent
for module_path in current_dir.glob("*.py"):
    if module_path.stem.startswith("__"):
        continue
    module = import_utils.load_module(module_path)

    cli_patterns: list[typing.Callable]
    if not import_utils.isiterable(cli_patterns := getattr(module, "cli_patterns", None)):
        continue

    for cli_func in cli_patterns:
        typer_app.command()(cli_func)
