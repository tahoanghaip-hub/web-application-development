from datetime import date
from uuid import UUID
from typing import Annotated, Literal
from pydantic import AwareDatetime, BaseModel, Field, StringConstraints

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=150)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10)]
ChapterTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2)]


class NovelData(BaseModel):
    title: Title
    description: Description
    deadline: date
    priority: Literal["Low", "Medium", "High"]
    status: Literal["Pending", "Done"] = "Pending"


class ChapterData(BaseModel):
    chapterTitle: ChapterTitle


class Draft(BaseModel):
    requestId: UUID | None = None
    content: str = Field(min_length=1)
    commitMessage: str = ""


class SavedVersion(BaseModel):
    versionId: str = Field(min_length=1)
    timestamp: AwareDatetime
    content: str
    commitMessage: str


class SavedChapter(BaseModel):
    chapterId: str = Field(min_length=1)
    chapterTitle: str = Field(min_length=1)
    status: Literal["Draft", "Published"] = "Draft"
    versions: list[SavedVersion]


class SavedNovel(NovelData):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    createdAt: AwareDatetime
    chapters: list[SavedChapter]
