import json, requests
import git
from git import Repo


with open (r"C:/Users/Joe/Documents/Python_Projects/PGE/user.json") as pss:
    pss_list = json.load(pss)
    username = pss_list["user"]
    token = pss_list["token"]
    #origin_1 = pss_list["origin"]
    #repo_1 = pss_list["repo"]
    br = pss_list["branch"]
    local_path = pss_list["local_path"]
    commit_msg = pss_list["commit_message"]

login = requests.get("https://github.com/", auth=(username, token))


#remote = repo.create_remote('origin', url=local_path)

repo = git.Repo()
print("repo:")
print(repo)


#Cloning Repo:
def clone():
    git.Git(local_path).clone("origin")
    print("Finished!")
    exit()


def push():

    #repo = git.Repo(local_path)
    origin = repo.remote(name="origin")
    
    repo.git.checkout(br)

    repo.git.add('--all')

    repo.git.commit('-m', commit_msg)
    
    origin.push()
    print("Finished!")
    exit()
   
def main():
    choices = "clone, push"
    print("Commands to use: " + choices)

    choose_command = input("Type Command: ")
    choose_command = choose_command.lower()

    if choose_command == "clone":
        clone()

    elif choose_command == "push":
        push()

    else:
        print("\nNot a valid command!")
        print("\nUse " + choices)

main()
