export function WordHighlight({
  word,
  highlight,
}: {
  word: string
  highlight: string
}) {
  const index = word.toLowerCase().indexOf(highlight.toLowerCase())
  if (index === -1) return <>{word}</>

  return (
    <>
      {word.slice(0, index)}
      <span className="text-primary font-bold">
        {word.slice(index, index + highlight.length)}
      </span>
      {word.slice(index + highlight.length)}
    </>
  )
}
